"""Thin FastAPI proxy in front of the Omni chat/completions endpoint.

Keeps OMNI_KEY server-side. Frontend never sees it.
"""
from __future__ import annotations

import base64
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from yibu_audit import append_audit_record

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.getenv("OMNI_BASE_URL", "https://yibuapi.com/v1").rstrip("/")
MODEL = os.getenv("OMNI_MODEL", "qwen3.5-omni-flash")
AUDIT_LOG = ROOT / "artifacts" / "yibu_api_calls.jsonl"
AUDIT_PURPOSE = "voice_audio_understanding"
SYSTEM_PROMPT = (
    "You are a sous-chef coaching someone who is cooking right now. Your reply will be spoken aloud. "
    "Answer in one or two short, plain sentences. No markdown, lists, asterisks, or emoji."
)

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


load_dotenv()

MOCK = os.getenv("VOICE_MOCK", "").lower() in {"1", "true", "yes"}

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
        for ext, (mime, fmt) in AUDIO_KINDS.items():
            if mime == content_type:
                return mime, fmt
    # Fall back to webm, the common MediaRecorder default outside Safari.
    return "audio/webm", "webm"


def extract_text(response_json: dict) -> str:
    choices = response_json.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(item.get("text") or "") for item in content if isinstance(item, dict))
    return str(content or "")


@app.post("/api/voice")
async def voice(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    current_step: Optional[str] = Form(None),
):
    audio_bytes = await audio.read()

    if MOCK:
        return {
            "text": f"[MOCK] got {len(audio_bytes)} bytes of audio for session {session_id}",
            "audio": None,
        }

    key = os.getenv("OMNI_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="OMNI_KEY is not configured on the server")

    mime, fmt = guess_audio_kind(audio.filename or "", audio.content_type)
    data_uri = f"data:{mime};base64,{base64.b64encode(audio_bytes).decode('ascii')}"

    system = SYSTEM_PROMPT
    if current_step:
        system += f" The user is currently on this cooking step: {current_step}"
    messages = [{"role": "system", "content": system}]
    messages.append({
        "role": "user",
        "content": [
            {"type": "input_audio", "input_audio": {"data": data_uri, "format": fmt}},
        ],
    })

    payload = {"model": MODEL, "messages": messages, "max_tokens": 256, "temperature": 0.2}
    endpoint = f"{BASE_URL}/chat/completions"
    audit = {"model": MODEL, "api_key": key, "endpoint": endpoint, "purpose": AUDIT_PURPOSE,
             "transport": "http", "audit_log": AUDIT_LOG}

    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started,
                            error=f"{type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail=f"Omni request failed: {exc}")

    try:
        body = response.json()
        body = body if isinstance(body, dict) else {}
    except ValueError:
        body = {}
    ok = response.status_code == 200
    append_audit_record(**audit, ok=ok, status_code=response.status_code,
                        latency_s=time.monotonic() - started, response_json=body,
                        error=None if ok else response.text)

    if not ok:
        raise HTTPException(status_code=502, detail=f"Omni {response.status_code}: {response.text}")

    return {"text": extract_text(body), "audio": None}
