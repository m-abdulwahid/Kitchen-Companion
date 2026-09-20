"""Probe whether Omni can return spoken audio over HTTP chat/completions.

Tries the Qwen Omni convention (`modalities` + `audio` block) both non-streaming and
streaming, prints what comes back, and saves any audio it finds to voice/samples/.
Every call is recorded in artifacts/yibu_api_calls.jsonl (purpose: tts_probe).

Run from the repo root:  python scripts/probe_tts.py [voice1,voice2,...]
Findings are written up in docs/omni-voice.md.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import wave
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "voice"))
from yibu_audit import append_audit_record  # noqa: E402

BASE_URL = os.getenv("OMNI_BASE_URL", "https://yibuapi.com/v1").rstrip("/")
MODEL = os.getenv("OMNI_MODEL", "qwen3.5-omni-flash")
ENDPOINT = f"{BASE_URL}/chat/completions"
AUDIT_LOG = ROOT / "artifacts" / "yibu_api_calls.jsonl"
OUT_DIR = ROOT / "voice" / "samples"
PROMPT = "Say in one short sentence: your onions look golden, time to add the garlic."


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


def shape(value, depth=0):
    """Describe a JSON value's structure without dumping huge base64 blobs."""
    if isinstance(value, dict):
        return {k: shape(v, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        return [shape(v, depth + 1) for v in value[:2]] + (["..."] if len(value) > 2 else [])
    if isinstance(value, str) and len(value) > 80:
        return f"<str len={len(value)}>"
    return value


def save_pcm_as_wav(pcm: bytes, path: Path, rate: int = 24000) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)


def call(label: str, payload: dict, key: str) -> None:
    print(f"\n=== {label} ===")
    print("request extras:", {k: v for k, v in payload.items() if k not in ("messages", "model")})
    started = time.monotonic()
    audit = {"model": MODEL, "api_key": key, "endpoint": ENDPOINT, "purpose": "tts_probe",
             "transport": "http", "audit_log": AUDIT_LOG}
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    slug = label.split()[0].lower()
    try:
        with httpx.Client(timeout=90.0, trust_env=False) as client:
            if payload.get("stream"):
                handle_stream(client, payload, headers, audit, started, slug)
            else:
                handle_plain(client, payload, headers, audit, started, slug)
    except httpx.HTTPError as exc:
        append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started, error=str(exc))
        print("HTTP error:", exc)


def handle_plain(client, payload, headers, audit, started, slug) -> None:
    response = client.post(ENDPOINT, json=payload, headers=headers)
    elapsed = time.monotonic() - started
    print(f"status={response.status_code} time={elapsed:.2f}s")
    if response.status_code != 200:
        append_audit_record(**audit, ok=False, status_code=response.status_code, latency_s=elapsed, error=response.text)
        print("error body:", response.text[:600])
        return
    body = response.json()
    append_audit_record(**audit, ok=True, status_code=200, latency_s=elapsed, response_json=body)
    message = (body.get("choices") or [{}])[0].get("message") or {}
    print("message keys:", list(message), "| text:", repr(message.get("content")))
    print("usage.completion_tokens_details:", (body.get("usage") or {}).get("completion_tokens_details"))
    print("audio in message?", "audio" in message)


def handle_stream(client, payload, headers, audit, started, slug) -> None:
    text_parts, audio_b64, events, last_usage, first_audio_at, error = [], [], 0, None, None, None
    with client.stream("POST", ENDPOINT, json=payload, headers=headers) as response:
        print(f"status={response.status_code} headers-after={time.monotonic() - started:.2f}s")
        if response.status_code != 200:
            body = response.read().decode("utf-8", "replace")
            append_audit_record(**audit, ok=False, status_code=response.status_code,
                                latency_s=time.monotonic() - started, error=body)
            print("error body:", body[:600])
            return
        for line in response.iter_lines():
            if not line.startswith("data:") or line[5:].strip() == "[DONE]":
                continue
            try:
                event = json.loads(line[5:])
            except ValueError:
                continue
            events += 1
            error = event.get("error") or error
            last_usage = event.get("usage") or last_usage
            for choice in event.get("choices") or []:
                delta = choice.get("delta") or {}
                if delta.get("content"):
                    text_parts.append(delta["content"])
                audio = delta.get("audio")
                if isinstance(audio, dict):
                    if audio.get("data"):
                        if first_audio_at is None:
                            first_audio_at = time.monotonic() - started
                        audio_b64.append(audio["data"])
                    if audio.get("transcript"):
                        text_parts.append(audio["transcript"])
    elapsed = time.monotonic() - started
    append_audit_record(**audit, ok=error is None, status_code=200, latency_s=elapsed,
                        response_json={"usage": last_usage} if last_usage else None,
                        error=str(error) if error else None)
    print(f"sse events={events} total={elapsed:.2f}s first-audio-chunk="
          f"{'n/a' if first_audio_at is None else f'{first_audio_at:.2f}s'}")
    print(f"text/transcript={''.join(text_parts)!r}")
    if error:
        print("stream error:", error)
    if not audio_b64:
        return
    chunks = [base64.b64decode(c) for c in audio_b64]
    pcm = b"".join(chunks)
    print(f"audio chunks={len(chunks)} bytes={len(pcm)} first chunk starts with {chunks[0][:4]!r} "
          f"({'has RIFF header' if chunks[0][:4] == b'RIFF' else 'no RIFF header, raw PCM'})")
    path = OUT_DIR / f"tts_probe_{slug}.wav"
    save_pcm_as_wav(pcm, path)
    print(f"assumed 24kHz/16-bit/mono PCM -> {path.relative_to(ROOT)} (~{len(pcm) / 2 / 24000:.1f}s)")


def main() -> int:
    load_dotenv()
    key = os.getenv("OMNI_KEY")
    if not key:
        print("OMNI_KEY is missing from the environment or .env", file=sys.stderr)
        return 2
    voices = (sys.argv[1] if len(sys.argv) > 1 else "Tina").split(",")
    messages = [{"role": "user", "content": PROMPT}]
    for voice in voices:
        base = {"model": MODEL, "messages": messages, "modalities": ["text", "audio"],
                "audio": {"voice": voice.strip(), "format": "wav"}}
        stream = {"stream": True, "stream_options": {"include_usage": True}}
        call(f"A-{voice.strip()} nonstream", base, key)
        call(f"B-{voice.strip()} stream", {**base, **stream}, key)

    # C: the real use case, the user's recorded question in, a spoken answer out, one call.
    sample = OUT_DIR / "voice_test.wav"
    if sample.exists():
        data = base64.b64encode(sample.read_bytes()).decode("ascii")
        voice_in = [
            {"role": "system", "content": "You are a sous-chef. Answer in one or two short plain sentences."},
            {"role": "user", "content": [{"type": "input_audio",
                                          "input_audio": {"data": f"data:audio/wav;base64,{data}", "format": "wav"}}]},
        ]
        call("C-audio-in-audio-out stream",
             {"model": MODEL, "messages": voice_in, "modalities": ["text", "audio"],
              "audio": {"voice": voices[0].strip(), "format": "wav"}, **stream}, key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
