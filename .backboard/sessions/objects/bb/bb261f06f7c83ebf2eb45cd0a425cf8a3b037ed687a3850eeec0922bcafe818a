"""Thin FastAPI proxy in front of the Omni chat/completions endpoint.

Keeps OMNI_KEY server-side. Frontend never sees it. Takes the user's recorded question and
returns Omni's answer as text plus spoken audio (see docs/omni-voice.md for how that works).
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import time
import wave
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from yibu_audit import append_audit_record

ROOT = Path(__file__).resolve().parents[1]


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


# Must run before the settings below read the environment.
load_dotenv()

BASE_URL = os.getenv("OMNI_BASE_URL", "https://yibuapi.com/v1").rstrip("/")
MODEL = os.getenv("OMNI_MODEL", "qwen3.5-omni-flash")
VOICE = os.getenv("OMNI_VOICE", "Tina")
MOCK = os.getenv("VOICE_MOCK", "").lower() in {"1", "true", "yes"}
AUDIT_LOG = ROOT / "artifacts" / "yibu_api_calls.jsonl"
AUDIT_PURPOSE = "voice_audio_understanding"
SPEAK_AUDIT_PURPOSE = "voice_text_to_speech"
SYSTEM_PROMPT = (
    "You are a sous-chef coaching someone who is cooking right now. Your reply will be spoken aloud. "
    "Answer in at most two short, plain sentences, under 30 words in total. "
    "No markdown, lists, asterisks, or emoji."
)

# Omni has no separate TTS endpoint, so /api/speak asks the chat model to read text out loud.
SPEAK_PROMPT = (
    "You are a text-to-speech engine. Read the user's message aloud exactly as written, word for word. "
    "Do not answer it, add to it, translate it, or leave anything out."
)
MAX_SPEAK_CHARS = 600
SPEAK_CACHE_SIZE = 200

# Languages the app offers. The voices support 29 (see voices.json); to add one, add a line here
# and in frontend/src/lib/languages.ts. English is the source language: no translation step.
LANGUAGES = {"en": "English", "fr": "French", "es": "Spanish"}
TRANSLATE_PROMPT = (
    "You are a translator and text-to-speech engine for cooking instructions. Translate the user's message "
    "into {language} the way a cook would say it (for example, \"crack in the eggs\" means to add eggs by "
    "cracking them into the pan, not to make cracks in them). Translate every part, including labels such as "
    "\"Step 2\" and numbers, and leave nothing out. Then read your translation aloud in {language}, in a natural, "
    "native-sounding way. Say only the translation: no notes, no original text, nothing else."
)

# Voice library: catalog from Alibaba's official list (voices.json) plus what we verified against
# our API (voices_checked.json, made by scripts/verify_voices.py). See /voices.
VOICES_FILE = Path(__file__).resolve().parent / "voices.json"
VOICES_CHECKED_FILE = Path(__file__).resolve().parent / "voices_checked.json"
VOICES_PAGE = Path(__file__).resolve().parent / "static" / "voices.html"


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


CATALOG = load_json(VOICES_FILE)
VOICE_NAMES = {voice["name"] for voice in CATALOG.get("voices", [])}
if VOICE_NAMES and VOICE not in VOICE_NAMES:
    print(f"WARNING: OMNI_VOICE={VOICE!r} is not in voices.json; Omni may reject it. See /voices.")

# Omni streams raw PCM with no header. The rate is not stated by the API; 24 kHz / 16-bit / mono
# is inferred from speech pace (docs/omni-voice.md). Change here if voices sound too fast or slow.
PCM_SAMPLE_RATE = 24000

# Extension -> (mime type for the data URI, format value the Omni API expects).
# webm/mp4 are unconfirmed against the API; that's exactly what this route lets us find out.
AUDIO_KINDS = {
    "webm": ("audio/webm", "webm"),
    "mp4": ("audio/mp4", "mp4"),
    "m4a": ("audio/mp4", "mp4"),
    "wav": ("audio/wav", "wav"),
    "mp3": ("audio/mpeg", "mp3"),
    "ogg": ("audio/ogg", "ogg"),
}

app = FastAPI()

# Wide open for hackathon dev (Vite dev server + phone over a tunnel). Tighten before sharing publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def guess_audio_kind(filename: str, content_type: Optional[str]) -> tuple[str, str]:
    ext = Path(filename).suffix.lstrip(".").lower()
    if ext in AUDIO_KINDS:
        return AUDIO_KINDS[ext]
    if content_type:
        # MediaRecorder types carry codecs, e.g. "audio/webm;codecs=opus".
        base_type = content_type.split(";")[0].strip()
        for ext, (mime, fmt) in AUDIO_KINDS.items():
            if mime == base_type:
                return mime, fmt
    # Fall back to webm, the common MediaRecorder default outside Safari.
    return "audio/webm", "webm"


def pcm_to_wav(pcm: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(PCM_SAMPLE_RATE)
        wav.writeframes(pcm)
    return buffer.getvalue()


class OmniStream:
    """What we collect from Omni's server-sent-event reply."""

    def __init__(self) -> None:
        self.content: list[str] = []
        self.transcript: list[str] = []
        self.audio: list[bytes] = []
        self.usage: Optional[dict] = None
        self.error: Optional[dict] = None

    def feed(self, line: str) -> None:
        if not line.startswith("data:") or line[5:].strip() == "[DONE]":
            return
        try:
            event = json.loads(line[5:])
        except ValueError:
            return
        # Errors arrive inside the stream with HTTP 200 (e.g. an unsupported voice).
        self.error = event.get("error") or self.error
        self.usage = event.get("usage") or self.usage
        for choice in event.get("choices") or []:
            delta = choice.get("delta") or {}
            if delta.get("content"):
                self.content.append(delta["content"])
            audio = delta.get("audio")
            if isinstance(audio, dict):
                if audio.get("data"):
                    self.audio.append(base64.b64decode(audio["data"]))
                if audio.get("transcript"):
                    self.transcript.append(audio["transcript"])

    @property
    def text(self) -> str:
        return "".join(self.content) or "".join(self.transcript)


class SpeakRequest(BaseModel):
    text: str
    # Optional: preview any catalog voice without changing OMNI_VOICE (used by /voices).
    voice: Optional[str] = None
    # Optional language code (see LANGUAGES). The text is translated, then spoken in that language.
    language: Optional[str] = None


# (voice, text) -> reply. Steps are re-read often (repeat, back, next), so don't pay Omni twice.
speak_cache: OrderedDict[tuple[str, str, str], dict] = OrderedDict()


async def ask_omni(messages: list[dict], purpose: str, voice: Optional[str] = None) -> dict:
    """Send messages to Omni asking for text + speech; return {"text", "audio", "audio_mime"}."""
    key = os.getenv("OMNI_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="OMNI_KEY is not configured on the server")

    # Audio output only comes back when streaming (non-streaming returns text but no audio).
    payload = {
        "model": MODEL,
        "messages": messages,
        "modalities": ["text", "audio"],
        "audio": {"voice": voice or VOICE, "format": "wav"},
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": 512,
        "temperature": 0.2,
    }
    endpoint = f"{BASE_URL}/chat/completions"
    audit = {"model": MODEL, "api_key": key, "endpoint": endpoint, "purpose": purpose,
             "transport": "http", "audit_log": AUDIT_LOG}

    started = time.monotonic()
    result = OmniStream()
    try:
        async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
            async with client.stream(
                "POST",
                endpoint,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            ) as response:
                if response.status_code != 200:
                    body = (await response.aread()).decode("utf-8", "replace")
                    append_audit_record(**audit, ok=False, status_code=response.status_code,
                                        latency_s=time.monotonic() - started, error=body)
                    raise HTTPException(status_code=502, detail=f"Omni {response.status_code}: {body}")
                async for line in response.aiter_lines():
                    result.feed(line)
    except httpx.HTTPError as exc:
        append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started,
                            error=f"{type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail=f"Omni request failed: {exc}")

    elapsed = time.monotonic() - started
    usage = {"usage": result.usage} if result.usage else None
    if result.error:
        append_audit_record(**audit, ok=False, status_code=200, latency_s=elapsed,
                            response_json=usage, error=json.dumps(result.error))
        raise HTTPException(status_code=502, detail=f"Omni stream error: {result.error.get('message', result.error)}")
    append_audit_record(**audit, ok=True, status_code=200, latency_s=elapsed, response_json=usage)

    pcm = b"".join(result.audio)
    if not pcm:
        # Text-only reply; the frontend falls back to the browser's speech synthesis.
        return {"text": result.text, "audio": None, "audio_mime": None}
    return {
        "text": result.text,
        "audio": base64.b64encode(pcm_to_wav(pcm)).decode("ascii"),
        "audio_mime": "audio/wav",
    }


def clean_line(value: Optional[str], limit: int) -> str:
    """One short line of plain text: no control characters or line breaks, at most `limit` characters."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", value or "").strip()[:limit].strip()


def build_system_prompt(name: str, style: str, current_step: Optional[str], language: str = "en") -> str:
    prompt = SYSTEM_PROMPT
    if language != "en":
        prompt += f" Always answer in {LANGUAGES[language]}, whatever language the user speaks."
    if name:
        prompt = prompt.replace("You are a sous-chef", f"You are {name}, a sous-chef", 1)
    if style:
        prompt += f" Your personality: {style}"
    if current_step:
        prompt += f" The user is currently on this cooking step: {current_step}"
    return prompt


@app.post("/api/voice")
async def voice(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    current_step: Optional[str] = Form(None),
    # Optional: who is answering. The frontend sends the chosen cooking companion (see /voices).
    voice: Optional[str] = Form(None),
    assistant_name: Optional[str] = Form(None),
    style: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
):
    if voice and VOICE_NAMES and voice not in VOICE_NAMES:
        raise HTTPException(status_code=400, detail=f"unknown voice {voice!r}; see /api/voices")
    language = language or "en"
    if language not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"unknown language {language!r}; use one of {sorted(LANGUAGES)}")
    audio_bytes = await audio.read()

    if MOCK:
        return {
            "text": f"[MOCK] got {len(audio_bytes)} bytes of audio for session {session_id}",
            "audio": None,
            "audio_mime": None,
        }

    mime, fmt = guess_audio_kind(audio.filename or "", audio.content_type)
    data_uri = f"data:{mime};base64,{base64.b64encode(audio_bytes).decode('ascii')}"

    system = build_system_prompt(clean_line(assistant_name, 30), clean_line(style, 160), current_step, language)
    messages = [{"role": "system", "content": system}]
    messages.append({
        "role": "user",
        "content": [
            {"type": "input_audio", "input_audio": {"data": data_uri, "format": fmt}},
        ],
    })
    return await ask_omni(messages, AUDIT_PURPOSE, voice)


@app.post("/api/speak")
async def speak(request: SpeakRequest):
    """Text in, spoken audio out: lets recipe steps use the same Omni voice as answers."""
    text = " ".join(request.text.split())
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")
    if len(text) > MAX_SPEAK_CHARS:
        raise HTTPException(status_code=400, detail=f"text is longer than {MAX_SPEAK_CHARS} characters")

    if MOCK:
        return {"text": text, "audio": None, "audio_mime": None}

    voice = request.voice or VOICE
    if request.voice and VOICE_NAMES and request.voice not in VOICE_NAMES:
        raise HTTPException(status_code=400, detail=f"unknown voice {request.voice!r}; see /api/voices")

    language = request.language or "en"
    if language not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"unknown language {language!r}; use one of {sorted(LANGUAGES)}")

    cache_key = (voice, language, text)
    if cache_key in speak_cache:
        speak_cache.move_to_end(cache_key)
        return speak_cache[cache_key]

    prompt = SPEAK_PROMPT if language == "en" else TRANSLATE_PROMPT.format(language=LANGUAGES[language])
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": text},
    ]
    reply = await ask_omni(messages, SPEAK_AUDIT_PURPOSE, voice)
    if reply["audio"]:  # never cache a text-only failure
        speak_cache[cache_key] = reply
        while len(speak_cache) > SPEAK_CACHE_SIZE:
            speak_cache.popitem(last=False)
    return reply


@app.get("/api/voices")
def voices():
    """The voice library: catalog, which voice is in use, and what we verified."""
    checked = load_json(VOICES_CHECKED_FILE)
    results = checked.get("results", {})
    return {
        "provider": CATALOG.get("provider"),
        "source_url": CATALOG.get("source_url"),
        "model_family": CATALOG.get("model_family"),
        "languages_note": CATALOG.get("languages_note"),
        "other_model_families": CATALOG.get("other_model_families"),
        "model": MODEL,
        "active_voice": VOICE,
        "default_voice": CATALOG.get("default_voice"),
        "checked_at": checked.get("checked_at"),
        "checked_model": checked.get("model"),
        "max_text_chars": MAX_SPEAK_CHARS,
        "languages": [{"code": code, "name": name} for code, name in LANGUAGES.items()],
        "voices": [
            {**voice, "works": (results.get(voice["name"]) or {}).get("ok")}
            for voice in CATALOG.get("voices", [])
        ],
    }


@app.get("/voices", include_in_schema=False)
def voices_page():
    """Voice library page: browse and preview voices."""
    return FileResponse(VOICES_PAGE)
