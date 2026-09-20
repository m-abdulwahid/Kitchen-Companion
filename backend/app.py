"""Realtime Omni relay for the hands-free cooking companion.

The browser sends raw PCM16 frames to this service; only this service opens the
provider WebSocket, so ``OMNI_KEY`` never enters browser code.  The protocol is
small on purpose:

* first message: ``session.configure`` with recipe/companion context;
* binary message: a PCM16 chunk, relayed as ``input_audio_buffer.append``;
* ``step``: refreshes the current cooking-step prompt without reconnecting;
* ``interrupt``: cancels a reply and clears queued input audio.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Protocol
from urllib.parse import urlencode

import websockets
import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from voice.backboard_memory import BackboardMemory, extract_memory_command, memory_context, valid_profile_id


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENDPOINT = "wss://yibuapi.com/v1/realtime"
DEFAULT_MODEL = "qwen3.5-omni-plus-realtime"
DEFAULT_VOICE = "Tina"  # The only Realtime voice verified in the Phase 0 gate.
MAX_TEXT_LENGTH = 500
MAX_PCM_CHUNK_BYTES = 24_000  # 500 ms at 24 kHz mono PCM16.
LANGUAGES = {"en": "English", "fr": "French", "es": "Spanish"}
VAD_CONFIG = {
    "type": "server_vad",
    # Reject quiet kitchen noise and background whispers before they can
    # interrupt a spoken reply. Browser capture also enables noise suppression.
    "threshold": 0.7,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 800,
}


def load_dotenv() -> None:
    """Load root .env without another dependency, matching voice/app.py."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()
LIVE_MEMORY = BackboardMemory()


@dataclass(frozen=True)
class Settings:
    api_key: str
    model: str
    endpoint: str


def settings_from_env() -> Settings:
    return Settings(
        api_key=os.getenv("OMNI_KEY", "").strip(),
        model=os.getenv("OMNI_REALTIME_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        endpoint=os.getenv("OMNI_REALTIME_ENDPOINT", DEFAULT_ENDPOINT).strip() or DEFAULT_ENDPOINT,
    )


def clean_text(value: Any, limit: int = MAX_TEXT_LENGTH) -> str:
    """Keep browser-provided context short, printable, and safe for a prompt."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()[:limit].strip()


@dataclass(frozen=True)
class CookingContext:
    recipe_title: str
    current_step: str
    companion_name: str = "Remy"
    companion_style: str = "Warm, precise, and encouraging."
    voice: str = DEFAULT_VOICE
    language: str = "en"
    memory: str = ""
    observation: str = ""

    @classmethod
    def from_message(cls, message: dict[str, Any]) -> "CookingContext":
        companion = message.get("companion")
        if not isinstance(companion, dict):
            companion = {}
        language = clean_text(companion.get("language") or message.get("language") or "en", 8).lower()
        if language not in LANGUAGES:
            raise ValueError(f"unsupported language {language!r}; use one of {sorted(LANGUAGES)}")
        recipe_title = clean_text(message.get("recipe_title"), 120)
        current_step = clean_text(message.get("current_step"), MAX_TEXT_LENGTH)
        if not recipe_title or not current_step:
            raise ValueError("session.configure requires recipe_title and current_step")
        return cls(
            recipe_title=recipe_title,
            current_step=current_step,
            companion_name=clean_text(companion.get("name") or "Remy", 40),
            companion_style=clean_text(companion.get("style") or "Warm, precise, and encouraging.", 240),
            voice=clean_text(companion.get("voice") or DEFAULT_VOICE, 60),
            language=language,
            observation=clean_text(message.get("camera_observation"), 320),
        )

    def with_step(self, current_step: Any) -> "CookingContext":
        step = clean_text(current_step, MAX_TEXT_LENGTH)
        if not step:
            raise ValueError("step requires a non-empty current_step")
        return CookingContext(
            recipe_title=self.recipe_title,
            current_step=step,
            companion_name=self.companion_name,
            companion_style=self.companion_style,
            voice=self.voice,
            language=self.language,
            memory=self.memory,
            observation=self.observation,
        )

    def with_memory(self, memory: str) -> "CookingContext":
        return CookingContext(
            recipe_title=self.recipe_title,
            current_step=self.current_step,
            companion_name=self.companion_name,
            companion_style=self.companion_style,
            voice=self.voice,
            language=self.language,
            memory=clean_text(memory, 800),
            observation=self.observation,
        )

    def with_observation(self, observation: Any) -> "CookingContext":
        return CookingContext(
            recipe_title=self.recipe_title,
            current_step=self.current_step,
            companion_name=self.companion_name,
            companion_style=self.companion_style,
            voice=self.voice,
            language=self.language,
            memory=self.memory,
            observation=clean_text(observation, 320),
        )


@dataclass
class RelayState:
    """Shared prompt state for both directions of one live WebSocket session."""

    context: CookingContext
    memory_profile_id: str = ""
    saved_voice_commands: set[tuple[str, str]] = field(default_factory=set)


def build_system_prompt(context: CookingContext) -> str:
    language_instruction = ""
    if context.language != "en":
        language_instruction = f" Always answer in {LANGUAGES[context.language]}."
    observation_instruction = (
        f"Latest verified camera observation: {context.observation}. Use this only as evidence from a recent still frame, "
        "not as a claim that you have a continuous live view. If the cook asks about visual detail not in this observation, "
        "ask them to point the camera at it. "
        if context.observation
        else "There is no verified camera observation yet. Do not claim that you can see the cook or their food. "
    )
    return (
        f"You are {context.companion_name}, a sous-chef coaching someone who is cooking right now. "
        "Your reply will be spoken aloud. Answer in at most two short, plain sentences, under 30 words total. "
        "No markdown, lists, asterisks, or emoji. "
        "Treat the recipe as background reference, not a script: never recite, summarize, or advance its steps "
        "unless the cook explicitly asks what to do next, asks for a repeat, or asks for directions. "
        "Prioritize the latest verified camera observation when answering what the cook is doing or what they should do now. "
        "Never invent a visual detail that is not in that observation. "
        f"Your personality: {context.companion_style} "
        f"Recipe: {context.recipe_title}. Current cooking step: {context.current_step}. "
        f"{observation_instruction}"
        "If the cook explicitly says ‘remember’ or ‘forget’ followed by a preference, briefly confirm it. "
        f"{context.memory}"
        f"{language_instruction}"
    )


def session_update(context: CookingContext) -> dict[str, Any]:
    """The known-good VAD setup from the Phase 0 Realtime gate."""
    return {
        "type": "session.update",
        "session": {
            "modalities": ["text", "audio"],
            "voice": context.voice,
            "instructions": build_system_prompt(context),
            "input_audio_format": "pcm16",
            "turn_detection": VAD_CONFIG,
        },
    }


def audio_append(pcm: bytes) -> dict[str, str]:
    if not pcm:
        raise ValueError("audio chunk is empty")
    if len(pcm) > MAX_PCM_CHUNK_BYTES:
        raise ValueError(f"audio chunk exceeds {MAX_PCM_CHUNK_BYTES} bytes")
    return {
        "type": "input_audio_buffer.append",
        "audio": base64.b64encode(pcm).decode("ascii"),
    }


class UpstreamSocket(Protocol):
    async def send(self, message: str) -> None: ...

    async def recv(self) -> str | bytes: ...


@asynccontextmanager
async def open_upstream(settings: Settings) -> AsyncIterator[UpstreamSocket]:
    """Connect with proxy discovery disabled, as in the vendor example."""
    if not settings.api_key:
        raise RuntimeError("OMNI_KEY is not configured on the backend")
    query = urlencode({"model": settings.model})
    url = settings.endpoint + ("&" if "?" in settings.endpoint else "?") + query
    async with websockets.connect(
        url,
        additional_headers={"Authorization": f"Bearer {settings.api_key}"},
        proxy=None,
        open_timeout=30,
        close_timeout=5,
        max_size=32 * 1024 * 1024,
    ) as upstream:
        yield upstream


def parse_upstream(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    event = json.loads(raw)
    if not isinstance(event, dict):
        raise RuntimeError("Omni sent a non-object event")
    return event


async def configure_upstream(upstream: UpstreamSocket, context: CookingContext) -> list[dict[str, Any]]:
    """Complete the provider handshake before accepting microphone frames."""
    created = parse_upstream(await asyncio.wait_for(upstream.recv(), timeout=20))
    if created.get("type") != "session.created":
        raise RuntimeError(f"expected session.created, got {created.get('type')}")
    await upstream.send(json.dumps(session_update(context), ensure_ascii=False))
    updated = parse_upstream(await asyncio.wait_for(upstream.recv(), timeout=20))
    if updated.get("type") != "session.updated":
        raise RuntimeError(f"expected session.updated, got {updated.get('type')}")
    return [created, updated]


def client_control_to_upstream(message: dict[str, Any], context: CookingContext) -> tuple[list[dict[str, Any]], CookingContext]:
    """Translate safe client controls; arbitrary provider events never cross this boundary."""
    message_type = message.get("type")
    if message_type == "step":
        updated_context = context.with_step(message.get("current_step") or message.get("step"))
        return [session_update(updated_context)], updated_context
    if message_type == "vision":
        observation = clean_text(message.get("observation"), 320)
        if not observation:
            raise ValueError("vision requires a non-empty observation")
        updated_context = context.with_observation(observation)
        return [session_update(updated_context)], updated_context
    if message_type == "interrupt":
        return [{"type": "response.cancel"}, {"type": "input_audio_buffer.clear"}], context
    if message_type == "text":
        text = clean_text(message.get("text"), MAX_TEXT_LENGTH)
        if not text:
            raise ValueError("text requires a non-empty value")
        return [
            {"type": "conversation.item.create", "item": {
                "type": "message", "role": "user", "content": [{"type": "input_text", "text": text}],
            }},
            {"type": "response.create"},
        ], context
    if message_type == "proactive":
        text = clean_text(message.get("text"), MAX_TEXT_LENGTH)
        if not text:
            raise ValueError("proactive requires a non-empty text value")
        return [
            {"type": "conversation.item.create", "item": {
                "type": "message", "role": "user", "content": [{
                    "type": "input_text",
                    "text": f"Camera coaching update. Say exactly this to the cook, with no additions: {text}",
                }],
            }},
            {"type": "response.create"},
        ], context
    raise ValueError(f"unsupported control message {message_type!r}")


async def forward_client(client: WebSocket, upstream: UpstreamSocket, state: RelayState) -> None:
    """Map browser PCM/control messages to the small allowed upstream protocol."""
    while True:
        incoming = await client.receive()
        if incoming["type"] == "websocket.disconnect":
            return
        if incoming.get("bytes") is not None:
            events = [audio_append(incoming["bytes"])]
        elif incoming.get("text") is not None:
            try:
                payload = json.loads(incoming["text"])
                if not isinstance(payload, dict):
                    raise ValueError("control message must be a JSON object")
                events, state.context = client_control_to_upstream(payload, state.context)
            except (ValueError, json.JSONDecodeError) as exc:
                await client.send_json({"type": "relay.error", "code": "invalid_client_message", "message": str(exc)})
                continue
        else:
            continue
        for event in events:
            await upstream.send(json.dumps(event, ensure_ascii=False))


async def with_live_memory(context: CookingContext, profile_id: str) -> CookingContext:
    """Recall a few explicit preferences without making Backboard availability a live-voice dependency."""
    if not profile_id or not LIVE_MEMORY.enabled:
        return context
    query = f"{context.recipe_title} {context.current_step} allergies dietary preferences substitutions"
    try:
        remembered = await LIVE_MEMORY.recall(profile_id, query)
    except (httpx.HTTPError, RuntimeError, ValueError):
        return context
    return context.with_memory(memory_context(remembered))


async def persist_voice_memory(
    client: WebSocket, upstream: UpstreamSocket, state: RelayState, transcript: str,
) -> None:
    """Persist only an explicit spoken command and refresh the live prompt afterwards."""
    command = extract_memory_command(transcript)
    if not command or not state.memory_profile_id:
        return
    command_key = (command.action, command.fact.casefold())
    if command_key in state.saved_voice_commands:
        return
    state.saved_voice_commands.add(command_key)
    if not LIVE_MEMORY.enabled:
        await client.send_json({"type": "relay.memory_error", "message": "Kitchen memory is not configured."})
        return
    try:
        if command.action == "remember":
            changed = await LIVE_MEMORY.remember(state.memory_profile_id, command.fact)
        else:
            changed = await LIVE_MEMORY.forget(state.memory_profile_id, command.fact)
        state.context = await with_live_memory(state.context, state.memory_profile_id)
        await upstream.send(json.dumps(session_update(state.context), ensure_ascii=False))
        await client.send_json({"type": "relay.memory", "action": command.action, "changed": changed})
    except (httpx.HTTPError, RuntimeError, ValueError):
        await client.send_json({"type": "relay.memory_error", "message": "Kitchen memory could not be updated."})


async def forward_upstream(client: WebSocket, upstream: UpstreamSocket, state: RelayState) -> None:
    """Forward provider events unchanged and save explicit voice-memory commands."""
    transcript = ""
    while True:
        raw = await upstream.recv()
        if isinstance(raw, bytes):
            await client.send_bytes(raw)
        else:
            try:
                event = parse_upstream(raw)
                event_type = event.get("type")
                if event_type == "input_audio_buffer.speech_started":
                    transcript = ""
                elif event_type == "conversation.item.input_audio_transcription.delta":
                    transcript = clean_text(transcript + str(event.get("delta") or ""), 300)
                elif event_type == "conversation.item.input_audio_transcription.completed":
                    transcript = clean_text(event.get("transcript") or transcript, 300)
                    await persist_voice_memory(client, upstream, state, transcript)
                elif event_type in {"input_audio_buffer.committed", "response.done"}:
                    await persist_voice_memory(client, upstream, state, transcript)
            except (json.JSONDecodeError, RuntimeError):
                # The browser still receives the raw provider event; unreadable telemetry must not end cooking.
                pass
            await client.send_text(raw)


async def relay(client: WebSocket, upstream: UpstreamSocket, state: RelayState) -> None:
    client_task = asyncio.create_task(forward_client(client, upstream, state))
    upstream_task = asyncio.create_task(forward_upstream(client, upstream, state))
    done, pending = await asyncio.wait({client_task, upstream_task}, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    for task in done:
        exception = task.exception()
        if exception:
            raise exception


app = FastAPI(title="Whisker live relay")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    settings = settings_from_env()
    return {
        "ok": True,
        "service": "whisker-live-relay",
        "model": settings.model,
        "omni_key_configured": bool(settings.api_key),
    }


@app.websocket("/api/live/{session_id}")
async def live_session(client: WebSocket, session_id: str) -> None:
    await client.accept()
    safe_session_id = clean_text(session_id, 80)
    try:
        initial = await asyncio.wait_for(client.receive_json(), timeout=20)
        if not isinstance(initial, dict) or initial.get("type") != "session.configure":
            raise ValueError("first message must be a session.configure JSON object")
        context = CookingContext.from_message(initial)
        memory_profile_id = valid_profile_id(initial.get("memory_profile_id"))
        state = RelayState(
            context=await with_live_memory(context, memory_profile_id),
            memory_profile_id=memory_profile_id,
        )
        settings = settings_from_env()
        async with open_upstream(settings) as upstream:
            handshake_events = await configure_upstream(upstream, state.context)
            for event in handshake_events:
                await client.send_json(event)
            await client.send_json({"type": "relay.ready", "session_id": safe_session_id})
            await relay(client, upstream, state)
    except WebSocketDisconnect:
        return
    except (ValueError, RuntimeError, asyncio.TimeoutError, websockets.WebSocketException) as exc:
        await client.send_json({"type": "relay.error", "message": str(exc)})
    finally:
        await client.close()


@app.get("/")
async def root() -> None:
    raise HTTPException(status_code=404, detail="Use /health or /api/live/{session_id}")
