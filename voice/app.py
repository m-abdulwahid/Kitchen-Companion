"""Thin FastAPI proxy in front of the Omni chat/completions endpoint.

Keeps OMNI_KEY server-side. Frontend never sees it. Takes the user's recorded question and
returns Omni's answer as text plus spoken audio (see docs/omni-voice.md for how that works).
"""
from __future__ import annotations

import base64
import hmac
import io
import json
import os
import re
import secrets
import time
import wave
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import httpx
import sentry_sdk
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from sentry_sdk.integrations.fastapi import FastApiIntegration
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

try:  # package import: `.venv/bin/uvicorn voice.app:app` from the repository root
    from . import agent as agent_brain
    from .backboard_memory import BackboardMemory, extract_memory_command, memory_context, valid_profile_id
    from . import usage as usage_data
    from . import vision as vision_data
    from .yibu_audit import append_audit_record, normalize_usage
except ImportError:  # script import: `cd voice && ../.venv/bin/uvicorn app:app`
    import agent as agent_brain
    from backboard_memory import BackboardMemory, extract_memory_command, memory_context, valid_profile_id
    import usage as usage_data
    import vision as vision_data
    from yibu_audit import append_audit_record, normalize_usage

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
BACKBOARD_MEMORY = BackboardMemory()
SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=1.0,
        profile_session_sample_rate=1.0,
        send_default_pii=False,
    )
AUDIT_LOG = ROOT / "artifacts" / "yibu_api_calls.jsonl"
AUDIT_PURPOSE = "voice_audio_understanding"
SPEAK_AUDIT_PURPOSE = "voice_text_to_speech"
VISION_AUDIT_PURPOSE = "vision_step_check"
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
VISION_PAGE = Path(__file__).resolve().parent / "static" / "vision.html"


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


# ---------------------------------------------------------------------------------------------
# Vision: "check my step". A camera photo (and optionally the recipe step) in, what Omni sees and
# coaching out. Text reply only: the frontend speaks the feedback with /api/speak.
# ---------------------------------------------------------------------------------------------
class VisionRequest(BaseModel):
    image: str  # data URI of the current frame (jpeg, png or webp)
    # Optional: an earlier frame, so Omni can tell what the cook just did.
    previous_image: Optional[str] = None
    # Optional: the recipe step. Without it Omni just describes and comments ("free mode"), passed is null.
    step: Optional[str] = None
    assistant_name: Optional[str] = None
    style: Optional[str] = None
    # Optional: what it said on earlier frames, so it does not repeat itself.
    recent: Optional[list[str]] = None


async def ask_omni_text(messages: list[dict], purpose: str) -> str:
    """Send messages to Omni and return its text reply (no speech; images in the messages are fine)."""
    key = os.getenv("OMNI_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="OMNI_KEY is not configured on the server")

    payload = {"model": MODEL, "messages": messages, "max_tokens": 300, "temperature": 0.2}
    endpoint = f"{BASE_URL}/chat/completions"
    audit = {"model": MODEL, "api_key": key, "endpoint": endpoint, "purpose": purpose,
             "transport": "http", "audit_log": AUDIT_LOG}

    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
            response = await client.post(
                endpoint, headers={"Authorization": f"Bearer {key}"}, json=payload)
    except httpx.HTTPError as exc:
        append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started,
                            error=f"{type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail=f"Omni request failed: {exc}")

    elapsed = time.monotonic() - started
    if response.status_code != 200:
        append_audit_record(**audit, ok=False, status_code=response.status_code, latency_s=elapsed,
                            error=response.text)
        raise HTTPException(status_code=502, detail=f"Omni {response.status_code}: {response.text}")
    body = response.json()
    append_audit_record(**audit, ok=True, status_code=200, latency_s=elapsed, response_json=body)
    try:
        return body["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="Omni reply had no message")


@app.post("/api/vision/check")
async def vision_check(request: VisionRequest):
    for image in (request.image, request.previous_image):
        problem = vision_data.image_problem(image) if image else None
        if problem:
            raise HTTPException(status_code=400, detail=problem)
    step = clean_line(request.step, vision_data.MAX_STEP_CHARS)

    if MOCK:
        return {"seen": "[MOCK] a kitchen", "passed": True if step else None,
                "feedback": "[MOCK] Looks good from here."}

    messages = vision_data.build_messages(
        request.image,
        step,
        clean_line(request.assistant_name, 30),
        clean_line(request.style, 160),
        request.previous_image or "",
        [clean_line(line, 200) for line in (request.recent or [])[-vision_data.MAX_RECENT:]],
    )
    reply = await ask_omni_text(messages, VISION_AUDIT_PURPOSE)
    verdict = vision_data.parse_verdict(reply, need_verdict=bool(step))
    if verdict is None:
        raise HTTPException(status_code=502, detail=f"Omni's reply was not in the expected shape: {reply[:200]!r}")
    return verdict


@app.get("/vision", include_in_schema=False)
def vision_page():
    """Live camera test page: sends frames to /api/vision/check and shows what comes back."""
    return FileResponse(VISION_PAGE)


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


# ---------------------------------------------------------------------------------------------
# Usage page (password protected). The page at /usage is an empty shell; the numbers only come from
# /api/usage after a server-side login, so hiding a box in the page is not the protection.
# The password is USAGE_PAGE_PASSWORD in .env. If it is not set, the page stays off.
# ---------------------------------------------------------------------------------------------
USAGE_PASSWORD = os.getenv("USAGE_PAGE_PASSWORD", "")
USAGE_PAGE = Path(__file__).resolve().parent / "static" / "usage.html"
USAGE_SESSION_SECONDS = 8 * 3600
USAGE_MAX_FAILS = 5  # wrong passwords per address ...
USAGE_LOCKOUT_SECONDS = 60  # ... within this window lock further tries
usage_sessions: dict[str, float] = {}  # login token -> expiry (monotonic clock)
usage_failures: dict[str, list[float]] = {}  # client address -> times of wrong passwords


class LoginRequest(BaseModel):
    password: str = ""


class ReportRequest(BaseModel):
    redact_paths: bool = False


def require_usage_login(authorization: Optional[str] = Header(None)) -> None:
    token = (authorization or "").removeprefix("Bearer ").strip()
    expires = usage_sessions.get(token)
    if not expires or expires < time.monotonic():
        usage_sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Log in first.")


def usage_ledgers() -> list[Path]:
    return [usage_data.LEDGER, *usage_data.extra_ledgers()]


@app.get("/usage", include_in_schema=False)
def usage_page():
    """The page itself holds no data."""
    return FileResponse(USAGE_PAGE, headers={"Cache-Control": "no-store"})


@app.post("/api/usage/login")
def usage_login(body: LoginRequest, request: Request):
    if not USAGE_PASSWORD:
        raise HTTPException(status_code=503, detail="The usage page is off. Set USAGE_PAGE_PASSWORD in .env and restart the voice service.")
    address = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = [t for t in usage_failures.get(address, []) if now - t < USAGE_LOCKOUT_SECONDS]
    if len(recent) >= USAGE_MAX_FAILS:
        wait = int(USAGE_LOCKOUT_SECONDS - (now - recent[0])) + 1
        raise HTTPException(status_code=429, detail=f"Too many wrong passwords. Try again in {wait} seconds.",
                            headers={"Retry-After": str(wait)})
    if hmac.compare_digest(body.password.encode(), USAGE_PASSWORD.encode()):
        usage_failures.pop(address, None)
        token = secrets.token_urlsafe(24)
        usage_sessions[token] = now + USAGE_SESSION_SECONDS
        return {"token": token, "expires_in": USAGE_SESSION_SECONDS}
    usage_failures[address] = recent + [now]
    raise HTTPException(status_code=401, detail="Wrong password.")


@app.post("/api/usage/logout")
def usage_logout(authorization: Optional[str] = Header(None)):
    usage_sessions.pop((authorization or "").removeprefix("Bearer ").strip(), None)
    return {"ok": True}


@app.get("/api/usage", dependencies=[Depends(require_usage_login)])
def usage_overview():
    """Everything the usage page shows. Contains no prompts, no audio and never the API key."""
    rows, sources = usage_data.merge(usage_ledgers())
    agg = usage_data.aggregate(rows)
    failed = usage_data.failed_calls(rows)
    return {
        **agg,
        "sources": sources,
        "failed_calls": failed,
        "known_gaps": usage_data.KNOWN_GAPS,
        "checks": usage_data.privacy_checks(rows),
        "files": usage_data.files_info(),
        "email_draft": usage_data.email_draft(agg, failed, sources) if rows else "",
        "deadline": usage_data.DEADLINE.isoformat(),
        "service": {"model": MODEL, "voice": VOICE, "key_configured": bool(os.getenv("OMNI_KEY")), "mock": MOCK},
    }


@app.post("/api/usage/report", dependencies=[Depends(require_usage_login)])
def usage_generate(body: ReportRequest):
    """Merge the ledgers and run the organisers' summarize_usage.py to write the two files to send."""
    rows, _ = usage_data.merge(usage_ledgers())
    if not rows:
        return {"ok": False, "message": "No calls recorded yet."}
    return usage_data.generate_files(rows, redact_paths=body.redact_paths)


@app.get("/api/usage/files/{name}", dependencies=[Depends(require_usage_login)])
def usage_file(name: str):
    data = usage_data.read_summary_file(name)  # only the two report files can be read
    if data is None:
        raise HTTPException(status_code=404, detail="Generate the files first.")
    media = "application/json" if name.endswith(".json") else "text/csv"
    return Response(content=data, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------------------------------------
# Cooking agent: one endpoint for everything the assistant reacts to. The cook speaks, a camera
# check arrives, or a timer finishes; it returns what it heard and saw, what to say, and actions
# for the app to carry out (next step, timer, ...). The rules live in agent.py; see docs/agent.md.
# ---------------------------------------------------------------------------------------------
AGENT_EVENTS = {"speech", "frame", "text", "timer_done"}
AGENT_AUDIO_FORMATS = {"webm", "mp4", "ogg", "wav", "mp3"}
MAX_AGENT_AUDIO_CHARS = 4_000_000  # base64 characters; a 15 second recording is about 0.3 million


class AgentRecipe(BaseModel):
    title: str = ""
    steps: list[str]
    ingredients: list[str] = []
    servings: Optional[int] = None


class AgentTimer(BaseModel):
    label: str = "timer"
    seconds_left: int = 0


class AgentTurnRequest(BaseModel):
    session_id: str
    memory_profile_id: Optional[str] = None  # stable browser-local id; never an email or display name
    event: str  # speech | frame | text | timer_done
    recipe: AgentRecipe
    step_index: int = 0
    timers: list[AgentTimer] = []
    audio: Optional[str] = None  # base64 recording, for "speech"
    audio_format: Optional[str] = None  # webm, mp4, ogg, wav or mp3
    image: Optional[str] = None  # data URI of a camera frame, for "frame" (optional extra for "speech")
    text: Optional[str] = None  # for "text"
    timer_label: Optional[str] = None  # for "timer_done"
    assistant_name: Optional[str] = None
    style: Optional[str] = None
    auto_advance: bool = True


class MemoryRequest(BaseModel):
    profile_id: str
    fact: str
    action: str = "remember"  # remember | forget


async def ask_omni_chat(messages: list[dict], purpose: str) -> tuple[str, dict]:
    """Send messages to Omni; return its text reply and the token usage (for the app's usage meter)."""
    key = os.getenv("OMNI_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="OMNI_KEY is not configured on the server")
    payload = {"model": MODEL, "messages": messages, "max_tokens": 400, "temperature": 0.2}
    endpoint = f"{BASE_URL}/chat/completions"
    audit = {"model": MODEL, "api_key": key, "endpoint": endpoint, "purpose": purpose,
             "transport": "http", "audit_log": AUDIT_LOG}
    started = time.monotonic()
    with sentry_sdk.start_span(op="ai.omni", name=purpose) as span:
        span.set_data("ai.model", MODEL)
        try:
            async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
                response = await client.post(endpoint, headers={"Authorization": f"Bearer {key}"}, json=payload)
        except httpx.HTTPError as exc:
            span.set_data("error.type", type(exc).__name__)
            append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started,
                                error=f"{type(exc).__name__}: {exc}")
            raise HTTPException(status_code=502, detail=f"Omni request failed: {exc}")
        elapsed = time.monotonic() - started
        span.set_data("http.response.status_code", response.status_code)
        if response.status_code != 200:
            append_audit_record(**audit, ok=False, status_code=response.status_code, latency_s=elapsed, error=response.text)
            raise HTTPException(status_code=502, detail=f"Omni {response.status_code}: {response.text}")
        body = response.json()
        append_audit_record(**audit, ok=True, status_code=200, latency_s=elapsed, response_json=body)
        try:
            text = body["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            raise HTTPException(status_code=502, detail="Omni reply had no message")
        used = normalize_usage(body)
        span.set_data("ai.usage.input_tokens", used.get("input_tokens") or 0)
        span.set_data("ai.usage.output_tokens", used.get("output_tokens") or 0)
        return text, {"input": used.get("input_tokens"), "output": used.get("output_tokens"), "total": used.get("total_tokens")}


@app.post("/api/memory")
async def update_memory(request: MemoryRequest):
    """Save/remove an explicitly chosen cooking preference without an Omni call."""
    if not BACKBOARD_MEMORY.enabled:
        raise HTTPException(status_code=503, detail="Backboard memory is not configured. Add BACKBOARD_API_KEY to .env and restart the voice service.")
    profile_id = valid_profile_id(request.profile_id)
    fact = clean_line(request.fact, 240)
    if not profile_id:
        raise HTTPException(status_code=400, detail="memory profile is invalid")
    if len(fact) < 3:
        raise HTTPException(status_code=400, detail="memory needs at least three characters")
    if request.action not in {"remember", "forget"}:
        raise HTTPException(status_code=400, detail="action must be remember or forget")
    try:
        if request.action == "remember":
            changed = await BACKBOARD_MEMORY.remember(profile_id, fact)
        else:
            changed = await BACKBOARD_MEMORY.forget(profile_id, fact)
    except (httpx.HTTPError, RuntimeError, ValueError):
        raise HTTPException(status_code=502, detail="Backboard memory is temporarily unavailable")
    return {"ok": True, "action": request.action, "changed": changed}


@app.post("/api/agent/turn")
async def agent_turn(request: AgentTurnRequest):
    if request.event not in AGENT_EVENTS:
        raise HTTPException(status_code=400, detail=f"event must be one of {sorted(AGENT_EVENTS)}")
    steps = [clean_line(step, 600) for step in request.recipe.steps[:40]]
    steps = [step for step in steps if step]
    if not steps:
        raise HTTPException(status_code=400, detail="recipe has no steps")
    recipe = {
        "title": clean_line(request.recipe.title, 120),
        "servings": request.recipe.servings if isinstance(request.recipe.servings, int) and 0 < request.recipe.servings < 100 else None,
        "ingredients": [line for line in (clean_line(i, 120) for i in request.recipe.ingredients[:60]) if line],
        "steps": steps,
    }
    step_index = min(max(request.step_index, 0), len(steps) - 1)
    timers = [{"label": clean_line(t.label, 40) or "timer", "seconds_left": min(max(t.seconds_left, 0), 3 * 3600)}
              for t in request.timers[:10]]
    session = agent_brain.get_session(clean_line(request.session_id, 64) or "default")
    event = request.event
    memory_profile_id = valid_profile_id(request.memory_profile_id)
    memory_status = {"enabled": BACKBOARD_MEMORY.enabled, "used": 0, "saved": False, "forgot": False}

    # a finished timer needs no model call
    if event == "timer_done":
        return {**agent_brain.timer_done_decision(request.timer_label or "timer", session), "usage": None,
                "step_index": step_index, "memory": memory_status}

    audio_b64, audio_format, image, text = "", "webm", "", ""
    if event == "speech":
        audio_b64 = (request.audio or "").split(",", 1)[-1]
        if not audio_b64 or len(audio_b64) > MAX_AGENT_AUDIO_CHARS:
            raise HTTPException(status_code=400, detail="speech needs a recording (base64 audio) of a sensible size")
        audio_format = request.audio_format if request.audio_format in AGENT_AUDIO_FORMATS else "webm"
    if event == "text":
        text = clean_line(request.text, 300)
        if not text:
            raise HTTPException(status_code=400, detail="text is empty")
    if event == "frame" and not request.image:
        raise HTTPException(status_code=400, detail="frame needs an image")
    if request.image:
        problem = vision_data.image_problem(request.image)
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        image = request.image

    stored_memories: list[str] = []
    if memory_profile_id and not MOCK:
        recall_query = " ".join([recipe["title"], steps[step_index], text or "cooking preferences and substitutions"])
        try:
            stored_memories = await BACKBOARD_MEMORY.recall(memory_profile_id, recall_query)
            memory_status["used"] = len(stored_memories)
        except (httpx.HTTPError, RuntimeError, ValueError):
            # Durable memory should improve the cook's experience, never block it.
            pass

    if MOCK:
        return {"heard": "", "seen": "", "step_done": None, "say": "[MOCK] Sounds good.", "actions": [], "note": "mock", "usage": None,
                "step_index": step_index, "memory": memory_status}

    messages = agent_brain.build_messages(
        event=event, recipe=recipe, step_index=step_index, timers=timers, session=session,
        name=clean_line(request.assistant_name, 30), style=clean_line(request.style, 160),
        text=text, audio_b64=audio_b64, audio_format=audio_format, image=image,
        memory=memory_context(stored_memories))
    reply, used = await ask_omni_chat(messages, f"agent_{event}")
    raw = agent_brain.parse_decision(reply)
    if raw is None:
        raise HTTPException(status_code=502, detail=f"Omni's reply was not in the expected shape: {reply[:200]!r}")
    decision = agent_brain.decide(event=event, raw=raw, session=session, step_index=step_index,
                                  n_steps=len(steps), timers=timers, auto_advance=request.auto_advance,
                                  has_image=bool(image))
    command = extract_memory_command(decision["heard"])
    if memory_profile_id and command:
        try:
            if command.action == "remember":
                memory_status["saved"] = await BACKBOARD_MEMORY.remember(memory_profile_id, command.fact)
            else:
                memory_status["forgot"] = await BACKBOARD_MEMORY.forget(memory_profile_id, command.fact)
        except (httpx.HTTPError, RuntimeError, ValueError):
            pass
    return {**decision, "usage": used, "step_index": step_index, "memory": memory_status}
