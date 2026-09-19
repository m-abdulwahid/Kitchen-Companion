"""Test every voice in voice/voices.json against our real Omni API and record which ones work.

Run from the repo root with the voice venv:
    voice\\.venv\\Scripts\\python scripts\\verify_voices.py [Name1,Name2,...]

With no arguments it tests all voices; with names it re-tests only those and keeps the rest.
Each test reads one short sentence and checks that audio comes back. Results go to
voice/voices_checked.json (used by the voice library page). Every call is logged in the audit
file (purpose: voice_verify). Nothing is played, and no audio is saved.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "voice"))
# Importing app loads the root .env and reuses the service's stream parsing.
from app import AUDIT_LOG, BASE_URL, MODEL, OmniStream, PCM_SAMPLE_RATE, SPEAK_PROMPT  # noqa: E402
from yibu_audit import append_audit_record  # noqa: E402

# The audit writer is not safe for several threads on Windows: unlocked, one of 56 records was lost.
AUDIT_LOCK = threading.Lock()


def audit_record(**fields) -> None:
    with AUDIT_LOCK:
        append_audit_record(**fields)

CATALOG = ROOT / "voice" / "voices.json"
CHECKED = ROOT / "voice" / "voices_checked.json"
TEXT = "Hi, I'm Pip, your sous-chef."
PARALLEL = 4


def check(name: str, key: str) -> dict:
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": SPEAK_PROMPT}, {"role": "user", "content": TEXT}],
        "modalities": ["text", "audio"],
        "audio": {"voice": name, "format": "wav"},
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": 128,
    }
    endpoint = f"{BASE_URL}/chat/completions"
    audit = {"model": MODEL, "api_key": key, "endpoint": endpoint, "purpose": "voice_verify",
             "transport": "http", "audit_log": AUDIT_LOG}
    started = time.monotonic()
    result = OmniStream()
    try:
        with httpx.Client(timeout=60.0, trust_env=False) as client:
            with client.stream("POST", endpoint, json=payload,
                               headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}) as response:
                if response.status_code != 200:
                    body = response.read().decode("utf-8", "replace")
                    audit_record(**audit, ok=False, status_code=response.status_code,
                                        latency_s=time.monotonic() - started, error=body)
                    return {"ok": False, "error": f"HTTP {response.status_code}: {body[:160]}"}
                for line in response.iter_lines():
                    result.feed(line)
    except httpx.HTTPError as exc:
        audit_record(**audit, ok=False, latency_s=time.monotonic() - started, error=str(exc))
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    elapsed = time.monotonic() - started
    usage = {"usage": result.usage} if result.usage else None
    if result.error:
        audit_record(**audit, ok=False, status_code=200, latency_s=elapsed, response_json=usage,
                            error=json.dumps(result.error))
        return {"ok": False, "error": str(result.error.get("message", result.error))[:160]}
    audit_record(**audit, ok=True, status_code=200, latency_s=elapsed, response_json=usage)
    pcm = sum(len(chunk) for chunk in result.audio)
    if not pcm:
        return {"ok": False, "error": "no audio returned"}
    return {"ok": True, "audio_s": round(pcm / 2 / PCM_SAMPLE_RATE, 1)}


def main() -> int:
    key = os.getenv("OMNI_KEY")
    if not key:
        print("OMNI_KEY is missing from .env", file=sys.stderr)
        return 2
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    names = [v["name"] for v in catalog["voices"]]
    wanted = [n.strip() for n in sys.argv[1].split(",")] if len(sys.argv) > 1 else names
    previous = json.loads(CHECKED.read_text(encoding="utf-8")) if CHECKED.exists() else {"results": {}}
    results = previous.get("results", {})

    print(f"Testing {len(wanted)} voice(s) on {MODEL}, {PARALLEL} at a time...")
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        for name, outcome in zip(wanted, pool.map(lambda n: check(n, key), wanted)):
            results[name] = outcome
            print(f"  {'ok  ' if outcome['ok'] else 'FAIL'} {name:12s} {outcome.get('audio_s', '')}{outcome.get('error', '')}")

    CHECKED.write_text(json.dumps({
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": MODEL,
        "test_text": TEXT,
        "results": results,
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    ok = sum(1 for r in results.values() if r["ok"])
    print(f"\n{ok} of {len(results)} recorded voices work on {MODEL}. Wrote {CHECKED.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
