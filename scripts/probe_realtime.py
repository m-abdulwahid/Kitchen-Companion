#!/usr/bin/env python3
"""Probe the Qwen Omni Realtime route before building the live relay.

The probes deliberately use the smallest possible interactions and write one
redacted audit entry per capability.  They test:

* audio output after a text turn;
* server-side VAD after PCM16 audio, without ``input_audio_buffer.commit``;
* accepting a JPEG supplied in a mid-session conversation item.

Run from the repository root after installing ``voice/requirements.txt``:

    python scripts/probe_realtime.py

The project root ``.env`` supplies ``OMNI_KEY``.  The script never prints it.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import struct
import sys
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import websockets

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "voice"))
from yibu_audit import append_audit_record, require_env_api_key  # noqa: E402


DEFAULT_ENDPOINT = "wss://yibuapi.com/v1/realtime"
DEFAULT_MODEL = "qwen3.5-omni-plus-realtime"
DEFAULT_AUDIT_LOG = ROOT / "artifacts" / "yibu_api_calls.jsonl"
DEFAULT_WAV = ROOT / "voice" / "samples" / "voice_test.wav"
DEFAULT_IMAGE = next(iter(sorted((ROOT / "vision").glob("snapshots_*/*.jpg"))), None)
VOICES_FILE = ROOT / "voice" / "voices.json"
VAD_CONFIG = {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 500,
}


@dataclass
class ProbeResult:
    name: str
    ok: bool = False
    events: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


def load_dotenv() -> None:
    """Match voice/app.py's intentionally small root-.env loader."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def json_event(event: dict[str, Any]) -> str:
    event_type = str(event.get("type") or "<missing type>")
    if event_type == "error":
        return f"error: {json.dumps(event.get('error') or event, ensure_ascii=False)}"
    return event_type


async def receive(ws: Any, result: ProbeResult, timeout: float = 30) -> dict[str, Any]:
    value = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
    if not isinstance(value, dict):
        raise RuntimeError("server event is not a JSON object")
    result.events.append(json_event(value))
    if value.get("type") == "error":
        raise RuntimeError(json.dumps(value.get("error") or value, ensure_ascii=False))
    return value


async def open_session(ws: Any, result: ProbeResult) -> None:
    created = await receive(ws, result)
    if created.get("type") != "session.created":
        raise RuntimeError(f"expected session.created, got {created.get('type')}")


async def update_session(ws: Any, result: ProbeResult, session: dict[str, Any]) -> None:
    await ws.send(json.dumps({"type": "session.update", "session": session}, ensure_ascii=False))
    updated = await receive(ws, result)
    if updated.get("type") != "session.updated":
        raise RuntimeError(f"expected session.updated, got {updated.get('type')}")


async def wait_for_response(ws: Any, result: ProbeResult, *, timeout: float = 90) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    while True:
        event = await receive(ws, result, timeout)
        events.append(event)
        if event.get("type") == "response.done":
            return events


def pcm16_mono_24khz(wav_path: Path) -> bytes:
    """Read a PCM WAV and linearly resample it for the Realtime PCM16 input."""
    with wave.open(str(wav_path), "rb") as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        rate = source.getframerate()
        frames = source.readframes(source.getnframes())
    if width != 2:
        raise ValueError(f"{wav_path} must contain 16-bit PCM audio, got {width * 8}-bit")
    samples = struct.unpack("<" + "h" * (len(frames) // 2), frames)
    if channels == 2:
        samples = tuple((samples[index] + samples[index + 1]) // 2 for index in range(0, len(samples), 2))
    elif channels != 1:
        raise ValueError(f"{wav_path} must be mono or stereo, got {channels} channels")
    if rate == 24000:
        return struct.pack("<" + "h" * len(samples), *samples)
    target_count = max(1, round(len(samples) * 24000 / rate))
    output = [samples[min(len(samples) - 1, int(index * rate / 24000))] for index in range(target_count)]
    return struct.pack("<" + "h" * len(output), *output)


def catalog_voice_names(path: Path = VOICES_FILE) -> list[str]:
    """Return the maintained voice catalog for the optional full compatibility run."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return [str(voice["name"]) for voice in data.get("voices", []) if voice.get("name")]


async def probe_audio(ws: Any, result: ProbeResult, voice: str) -> None:
    await open_session(ws, result)
    await update_session(ws, result, {
        "modalities": ["text", "audio"],
        "voice": voice,
        "instructions": "Reply with exactly: Kitchen companion ready.",
        "turn_detection": None,
    })
    await ws.send(json.dumps({
        "type": "conversation.item.create",
        "item": {"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": "Say the requested sentence."},
        ]},
    }))
    await ws.send(json.dumps({"type": "response.create"}))
    events = await wait_for_response(ws, result)
    audio_bytes = sum(len(base64.b64decode(str(event.get("delta") or "")))
                      for event in events if event.get("type") == "response.audio.delta")
    result.details.update({"voice": voice, "audio_bytes": audio_bytes})
    if not audio_bytes:
        raise RuntimeError("response.done arrived without a response.audio.delta")
    result.ok = True


async def probe_vad(ws: Any, result: ProbeResult, wav_path: Path) -> None:
    await open_session(ws, result)
    await update_session(ws, result, {
        "modalities": ["text"],
        "input_audio_format": "pcm16",
        "instructions": "Briefly acknowledge the user's cooking question.",
        "turn_detection": VAD_CONFIG,
    })
    pcm = pcm16_mono_24khz(wav_path)
    chunk_size = 4800  # 100 ms at 24 kHz mono PCM16
    for offset in range(0, len(pcm), chunk_size):
        await ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": base64.b64encode(pcm[offset:offset + chunk_size]).decode("ascii"),
        }))
    # Intentionally no input_audio_buffer.commit: server VAD must end the turn.
    events = await wait_for_response(ws, result, timeout=120)
    stopped = any(event.get("type") == "input_audio_buffer.speech_stopped" for event in events)
    result.details.update({"wav": str(wav_path.relative_to(ROOT)), "pcm_bytes": len(pcm), "speech_stopped": stopped})
    if not stopped:
        raise RuntimeError("response completed without input_audio_buffer.speech_stopped")
    result.ok = True


async def probe_image(ws: Any, result: ProbeResult, image_path: Path) -> None:
    await open_session(ws, result)
    await update_session(ws, result, {
        "modalities": ["text"],
        "instructions": "Describe the supplied image in five words or fewer.",
        "turn_detection": None,
    })
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    await ws.send(json.dumps({
        "type": "conversation.item.create",
        "item": {"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": "What is visible?"},
            {"type": "input_image", "image_url": f"data:image/jpeg;base64,{encoded}"},
        ]},
    }))
    await ws.send(json.dumps({"type": "response.create"}))
    events = await wait_for_response(ws, result)
    text = "".join(str(event.get("delta") or "") for event in events if event.get("type") == "response.text.delta")
    result.details.update({"image": str(image_path.relative_to(ROOT)), "response_text": text})
    result.ok = True


async def run_probe(name: str, api_key: str, endpoint: str, model: str, audit_log: Path, callback: Any) -> ProbeResult:
    result = ProbeResult(name=name)
    url = endpoint + ("&" if "?" in endpoint else "?") + urlencode({"model": model})
    started = time.monotonic()
    try:
        async with websockets.connect(
            url,
            additional_headers={"Authorization": f"Bearer {api_key}"},
            proxy=None,
            open_timeout=30,
            close_timeout=5,
            max_size=32 * 1024 * 1024,
        ) as ws:
            await callback(ws, result)
    except Exception as exc:  # Record a failed gate instead of hiding it behind a traceback.
        result.error = f"{type(exc).__name__}: {exc}"
    append_audit_record(
        model=model,
        api_key=api_key,
        endpoint=url,
        purpose=f"realtime_probe_{name}",
        transport="websocket",
        ok=result.ok,
        status_code=101 if result.ok else None,
        latency_s=time.monotonic() - started,
        response_json={"probe": name, "events": result.events, "details": result.details},
        error=result.error,
        audit_log=audit_log,
    )
    return result


async def main_async(args: argparse.Namespace, api_key: str) -> list[ProbeResult]:
    voices = catalog_voice_names() if args.all_voices else [args.voice]
    probes: list[tuple[str, Any]] = [
        (f"audio_{voice.lower().replace(' ', '_')}", lambda ws, result, voice=voice: probe_audio(ws, result, voice))
        for voice in voices
    ] + [
        ("vad", lambda ws, result: probe_vad(ws, result, args.wav)),
        ("image", lambda ws, result: probe_image(ws, result, args.image)),
    ]
    results = []
    for name, callback in probes:
        results.append(await run_probe(name, api_key, args.endpoint, args.model, args.audit_log, callback))
    return results


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=os.getenv("OMNI_REALTIME_MODEL", DEFAULT_MODEL))
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--api-key-env", default="OMNI_KEY")
    parser.add_argument("--voice", default=os.getenv("OMNI_VOICE", "Tina"))
    parser.add_argument("--all-voices", action="store_true", help="Probe every voice in voice/voices.json (uses 56 realtime turns).")
    parser.add_argument("--wav", type=Path, default=DEFAULT_WAV)
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE)
    parser.add_argument("--audit-log", type=Path, default=DEFAULT_AUDIT_LOG)
    args = parser.parse_args()
    if not args.wav.is_file():
        raise SystemExit(f"WAV file not found: {args.wav}")
    if args.image is None or not args.image.is_file():
        raise SystemExit("JPEG file not found; pass --image PATH")
    api_key = require_env_api_key(args.api_key_env)
    results = asyncio.run(main_async(args, api_key))
    print(json.dumps([{
        "probe": result.name,
        "ok": result.ok,
        "events": result.events,
        "details": result.details,
        "error": result.error,
    } for result in results], indent=2, ensure_ascii=False))
    return 0 if all(result.ok for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
