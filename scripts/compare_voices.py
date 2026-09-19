"""Generate the same sentence with different Omni models, voices and prompts, to compare by ear.

Run from the repo root with the voice venv:
    voice\\.venv\\Scripts\\python scripts\\compare_voices.py

Writes voice/samples/compare/NN_<model>_<voice>_<prompt>.wav and prints a table with length,
time and whether the words came back unchanged. Every call is logged in the audit file
(purpose: voice_compare). Findings are written up in docs/omni-voice.md.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "voice"))
# Importing app loads the root .env and gives us the same parsing/WAV code the service uses.
from app import AUDIT_LOG, BASE_URL, OmniStream, SPEAK_PROMPT, pcm_to_wav  # noqa: E402
from yibu_audit import append_audit_record  # noqa: E402
import os  # noqa: E402

OUT_DIR = ROOT / "voice" / "samples" / "compare"
SENTENCE = "Nice work, chef! Your onions look golden, so it's time to add the garlic and stir for one minute."

# Same job as SPEAK_PROMPT (read the text exactly) plus how to deliver it.
WARM_PROMPT = (
    "You are Pip, a warm, upbeat sous-chef, and you are speaking out loud to a friend in your kitchen. "
    "Read the user's message aloud exactly as written, word for word. Deliver it in a natural, friendly, "
    "expressive conversational voice, with lively intonation, natural rhythm and small pauses, like a real "
    "person talking, never like a narrator or a machine. Do not answer the message, add to it, or leave "
    "anything out."
)

# (model, voice, prompt name, prompt)
CASES = [
    ("qwen3.5-omni-flash", "Tina", "current", SPEAK_PROMPT),
    ("qwen3.5-omni-flash", "Tina", "warm", WARM_PROMPT),
    ("qwen3.5-omni-flash", "Ethan", "warm", WARM_PROMPT),
    ("qwen3.5-omni-flash", "Serena", "warm", WARM_PROMPT),
    ("qwen3.5-omni-plus", "Tina", "warm", WARM_PROMPT),
    ("qwen3.8-omni-flash", "Tina", "warm", WARM_PROMPT),
]


def words(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).split()


def run(index: int, model: str, voice: str, prompt_name: str, prompt: str, key: str) -> dict:
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": prompt}, {"role": "user", "content": SENTENCE}],
        "modalities": ["text", "audio"],
        "audio": {"voice": voice, "format": "wav"},
        "stream": True,
        "stream_options": {"include_usage": True},
        "temperature": 0.2,
        "max_tokens": 512,
    }
    endpoint = f"{BASE_URL}/chat/completions"
    audit = {"model": model, "api_key": key, "endpoint": endpoint, "purpose": "voice_compare",
             "transport": "http", "audit_log": AUDIT_LOG}
    started = time.monotonic()
    result = OmniStream()
    row = {"case": f"{model} / {voice} / {prompt_name}", "file": "", "secs": "", "audio_s": "", "same_words": "", "note": ""}
    try:
        with httpx.Client(timeout=90.0, trust_env=False) as client:
            with client.stream("POST", endpoint, json=payload,
                               headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}) as response:
                if response.status_code != 200:
                    body = response.read().decode("utf-8", "replace")
                    append_audit_record(**audit, ok=False, status_code=response.status_code,
                                        latency_s=time.monotonic() - started, error=body)
                    row["note"] = f"HTTP {response.status_code}: {body[:110]}"
                    return row
                for line in response.iter_lines():
                    result.feed(line)
    except httpx.HTTPError as exc:
        append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started, error=str(exc))
        row["note"] = f"{type(exc).__name__}: {exc}"
        return row
    elapsed = time.monotonic() - started
    usage = {"usage": result.usage} if result.usage else None
    append_audit_record(**audit, ok=result.error is None, status_code=200, latency_s=elapsed,
                        response_json=usage, error=json.dumps(result.error) if result.error else None)
    row["secs"] = f"{elapsed:.1f}"
    if result.error:
        row["note"] = str(result.error.get("message", result.error))[:120]
        return row
    pcm = b"".join(result.audio)
    if not pcm:
        row["note"] = "no audio returned"
        return row
    name = f"{index:02d}_{model}_{voice}_{prompt_name}.wav".replace("qwen", "q")
    (OUT_DIR / name).write_bytes(pcm_to_wav(pcm))
    row["file"] = name
    row["audio_s"] = f"{len(pcm) / 2 / 24000:.1f}"
    row["same_words"] = "yes" if words(result.text) == words(SENTENCE) else f"NO: {result.text!r}"
    return row


def main() -> int:
    key = os.getenv("OMNI_KEY")
    if not key:
        print("OMNI_KEY is missing from .env", file=sys.stderr)
        return 2
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f'Sentence: "{SENTENCE}"\n')
    for i, (model, voice, prompt_name, prompt) in enumerate(CASES, start=1):
        row = run(i, model, voice, prompt_name, prompt, key)
        print(f"{i}. {row['case']}")
        if row["note"]:
            print(f"     FAILED/NOTE: {row['note']}")
        if row["file"]:
            print(f"     {row['file']}  audio={row['audio_s']}s  took={row['secs']}s  same words: {row['same_words']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
