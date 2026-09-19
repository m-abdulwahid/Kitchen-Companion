"""Discover the configured Omni model and probe text and image chat calls."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.getenv("OMNI_BASE_URL", "https://yibuapi.com/v1").rstrip("/")


def load_dotenv() -> None:
    """Load simple KEY=VALUE entries without requiring a package."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def request_json(path: str, payload: dict | None = None, stream: bool = False) -> tuple[int, str, float]:
    key = os.environ["OMNI_KEY"]
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    request = Request(f"{BASE_URL}{path}", data=data, headers=headers, method="POST" if data else "GET")
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8", errors="replace")
            if stream:
                body = parse_stream_body(body)
            return response.status, body, time.perf_counter() - started
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        return error.code, body, time.perf_counter() - started
    except URLError as error:
        return 0, str(error), time.perf_counter() - started


def parse_stream_body(body: str) -> str:
    """Keep the raw SSE lines while making the result readable in docs/omni-notes.md."""
    chunks = []
    for line in body.splitlines():
        if line.startswith("data:"):
            chunks.append(line[5:].strip())
    return "\n".join(chunks) if chunks else body


def probe(label: str, payload: dict) -> dict:
    status, body, elapsed = request_json("/chat/completions", payload)
    result = {"label": label, "stream": False, "status": status, "seconds": round(elapsed, 3), "body": body}
    print(f"\n[{label}] stream=False status={status} time={elapsed:.3f}s")
    print(body)
    if status < 200 or status >= 300:
        streamed_payload = {**payload, "stream": True}
        status, body, elapsed = request_json("/chat/completions", streamed_payload, stream=True)
        result = {"label": label, "stream": True, "status": status, "seconds": round(elapsed, 3), "body": body}
        print(f"[{label}] stream=True status={status} time={elapsed:.3f}s")
        print(body)
    return result


def write_notes(model_names: list[str], selected_model: str, results: list[dict]) -> None:
    notes = [
        "# Omni discovery",
        "",
        f"- Base URL: `{BASE_URL}`",
        f"- Omni models returned by `/models`: {', '.join(f'`{name}`' for name in model_names) or 'none'}",
        f"- Selected model: `{selected_model}`",
        "- Audio probe format tried: OpenAI-compatible `messages[].content` with an `input_audio` block (`{data: base64, format: wav}`). This is a guess based on the OpenAI chat completions audio schema, not confirmed. Check the probe result below; if it failed, read the error for the field name the API actually expects.",
        "- Image probe format tried: OpenAI-compatible `messages[].content` with an `image_url` data URI. Deferred this run, vision comes later.",
        "",
        "## Probe results",
        "",
    ]
    for result in results:
        notes.extend([
            f"### {result['label']} (stream={result['stream']})",
            f"- Status: `{result['status']}`",
            f"- Time: `{result['seconds']}s`",
            "- Response:",
            "```text",
            result["body"],
            "```",
            "",
        ])
    (ROOT / "docs" / "omni-notes.md").write_text("\n".join(notes), encoding="utf-8")


def main() -> int:
    load_dotenv()
    if not os.getenv("OMNI_KEY"):
        print("OMNI_KEY is missing from the environment or .env", file=sys.stderr)
        return 2
    audio_path = ROOT / "voice" / "samples" / "voice_test.wav"
    image_path = ROOT / "vision" / "samples" / "pan.jpg"

    status, body, elapsed = request_json("/models")
    print(f"[/models] status={status} time={elapsed:.3f}s")
    print(body)
    if status < 200 or status >= 300:
        return 1
    try:
        models = json.loads(body).get("data", [])
        model_names = [item.get("id", "") for item in models if item.get("id")]
    except (TypeError, json.JSONDecodeError):
        print("Could not parse /models response as JSON", file=sys.stderr)
        return 1

    omni_models = [name for name in model_names if "omni" in name.lower()]
    print("Omni models:")
    for name in omni_models:
        print(f"- {name}")
    if not omni_models:
        print("No model name containing 'omni' was returned", file=sys.stderr)
        return 1

    # "-realtime" models are WebSocket-only (see qwen35_omni_plus_realtime.py in the
    # Yibu examples package); HTTP chat/completions needs a non-realtime model.
    http_models = [name for name in omni_models if "realtime" not in name.lower()]
    if not http_models:
        print("Only realtime models were returned; HTTP chat/completions won't work here", file=sys.stderr)
        return 1
    model = http_models[0]
    text_payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly: text probe ok"}],
    }
    results = [probe("text", text_payload)]

    if audio_path.exists():
        audio_type = mimetypes.guess_type(audio_path.name)[0] or "audio/wav"
        audio_data = base64.b64encode(audio_path.read_bytes()).decode("ascii")
        audio_payload = {
            "model": model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Reply with exactly what the speaker asked, in one short sentence."},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": f"data:{audio_type};base64,{audio_data}",
                            "format": audio_path.suffix.lstrip(".") or "wav",
                        },
                    },
                ],
            }],
        }
        results.append(probe("audio", audio_payload))
    else:
        print(f"\nSkipping audio probe: {audio_path} not found")

    if image_path.exists():
        image_type = mimetypes.guess_type(image_path.name)[0] or "image/jpeg"
        image_data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        image_payload = {
            "model": model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this cooking image in one short sentence."},
                    {"type": "image_url", "image_url": {"url": f"data:{image_type};base64,{image_data}"}},
                ],
            }],
        }
        results.append(probe("image", image_payload))
    else:
        print(f"\nSkipping image probe: {image_path} not found (vision comes later)")

    write_notes(omni_models, model, results)
    print("\nWrote docs/omni-notes.md")
    return 0 if all(200 <= result["status"] < 300 for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())