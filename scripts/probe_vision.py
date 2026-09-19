"""Probe whether Omni can look at an image over HTTP chat/completions.

Draws two fake pan photos (pale onions, golden onions), sends each with a cooking step as an
`image_url` data URI, and prints what comes back. Every call is recorded in
artifacts/yibu_api_calls.jsonl (purpose: vision_probe).

Run from the repo root:  python scripts/probe_vision.py
Findings are written up in docs/omni-notes.md.
"""

from __future__ import annotations

import base64
import io
import json
import os
import random
import sys
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "voice"))
from yibu_audit import append_audit_record  # noqa: E402

BASE_URL = os.getenv("OMNI_BASE_URL", "https://yibuapi.com/v1").rstrip("/")
MODEL = os.getenv("OMNI_MODEL", "qwen3.5-omni-flash")
ENDPOINT = f"{BASE_URL}/chat/completions"
AUDIT_LOG = ROOT / "artifacts" / "yibu_api_calls.jsonl"
STEP = "Saute the sliced onions in the pan until they are soft and golden brown."
PROMPT = (
    "You are checking a home cook's progress from a photo. The current step is: "
    f"{STEP}\nSay what you see in one sentence, then say whether the step looks done."
)


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


def fake_pan(onion: tuple[int, int, int]) -> str:
    """A dark pan with onion pieces scattered in it, as a JPEG data URI."""
    rng = random.Random(1)
    img = Image.new("RGB", (640, 480), (40, 40, 44))
    draw = ImageDraw.Draw(img)
    draw.ellipse((60, 40, 580, 440), fill=(25, 25, 28), outline=(90, 90, 96), width=10)
    for _ in range(90):
        x, y = rng.randint(120, 500), rng.randint(90, 380)
        w, h = rng.randint(30, 60), rng.randint(8, 16)
        shade = tuple(max(0, min(255, c + rng.randint(-12, 12))) for c in onion)
        draw.ellipse((x, y, x + w, y + h), fill=shade)
    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def ask(label: str, image_url: str, key: str) -> None:
    payload = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_url}},
                {"type": "text", "text": PROMPT},
            ],
        }],
        "max_tokens": 200,
        "temperature": 0.2,
    }
    audit = {"model": MODEL, "api_key": key, "endpoint": ENDPOINT, "purpose": "vision_probe",
             "transport": "http", "audit_log": AUDIT_LOG}
    started = time.monotonic()
    try:
        response = httpx.post(ENDPOINT, headers={"Authorization": f"Bearer {key}"}, json=payload,
                              timeout=60.0, trust_env=False)
    except httpx.HTTPError as exc:
        append_audit_record(**audit, ok=False, latency_s=time.monotonic() - started,
                            error=f"{type(exc).__name__}: {exc}")
        print(f"[{label}] request failed: {exc}")
        return
    elapsed = time.monotonic() - started
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    append_audit_record(**audit, ok=response.status_code == 200, status_code=response.status_code,
                        latency_s=elapsed, response_json=body if response.status_code == 200 else None,
                        error=None if response.status_code == 200 else response.text)
    print(f"[{label}] HTTP {response.status_code} in {elapsed:.1f}s")
    if response.status_code != 200:
        print("  ", response.text[:400])
        return
    print("  reply:", body["choices"][0]["message"]["content"])
    print("  usage:", json.dumps(body.get("usage")))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # replies can contain emoji; the Windows console defaults to cp1252
    load_dotenv()
    key = os.getenv("OMNI_KEY")
    if not key:
        sys.exit("OMNI_KEY is not set (see .env.example)")
    ask("pale onions", fake_pan((235, 225, 190)), key)
    ask("golden onions", fake_pan((170, 105, 30)), key)


if __name__ == "__main__":
    main()
