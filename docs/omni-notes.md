# Omni discovery

- Base URL: `https://yibuapi.com/v1`
- Omni models returned by `/models`: `qwen3.5-omni-flash`, `qwen3.5-omni-plus`, `qwen3.5-omni-plus-realtime`, `qwen3.8-omni-flash`
- Selected model: `qwen3.5-omni-flash`
- Audio probe format tried: OpenAI-compatible `messages[].content` with an `input_audio` block (`{data: base64, format: wav}`). This is a guess based on the OpenAI chat completions audio schema, not confirmed. Check the probe result below; if it failed, read the error for the field name the API actually expects.
- Image probe format tried: OpenAI-compatible `messages[].content` with an `image_url` data URI. Deferred this run, vision comes later.

## Probe results

### text (stream=False)
- Status: `200`
- Time: `0.566s`
- Response:
```text
{"choices":[{"message":{"content":"text probe ok","reasoning_content":"","role":"assistant"},"finish_reason":"stop","index":0,"logprobs":null}],"object":"chat.completion","usage":{"prompt_tokens":19,"completion_tokens":4,"total_tokens":23,"prompt_tokens_details":{"text_tokens":19},"completion_tokens_details":{"text_tokens":4}},"created":1789793891,"system_fingerprint":null,"model":"qwen3.5-omni-flash","id":"chatcmpl-ca986b20-3952-9b8f-9325-af1636192bc3"}
```

### audio (stream=False)
- Status: `200`
- Time: `1.844s`
- Response:
```text
{"choices":[{"message":{"content":"Hey chef, how much longer should I sauté the onions?","reasoning_content":"","role":"assistant"},"finish_reason":"stop","index":0,"logprobs":null}],"object":"chat.completion","usage":{"prompt_tokens":55,"completion_tokens":14,"total_tokens":69,"prompt_tokens_details":{"audio_tokens":30,"text_tokens":25},"completion_tokens_details":{"text_tokens":14}},"created":1789793893,"system_fingerprint":null,"model":"qwen3.5-omni-flash","id":"chatcmpl-4ab49ff6-5a2a-98a0-8e96-b32ca7f91dbc"}
```

## Realtime gate — Phase 0

Status: complete — compact gate run on 2026-09-19 with `qwen3.5-omni-plus-realtime`. Do not infer support from the HTTP probes above: the Realtime WebSocket model was tested directly.

Install the probe dependency in the project virtual environment, then run the compact gate:

```bash
.venv/bin/python -m pip install -r voice/requirements.txt
.venv/bin/python scripts/probe_realtime.py
```

For the complete voice-compatibility answer, run this separately; it makes one short Realtime request for every voice in `voice/voices.json` (currently 56), so it deliberately is not the default:

```bash
.venv/bin/python scripts/probe_realtime.py --all-voices
```

The three payloads under test are deliberately kept in [`scripts/probe_realtime.py`](../scripts/probe_realtime.py), with no credentials embedded:

```json
{"type":"session.update","session":{"modalities":["text","audio"],"voice":"Tina","instructions":"Reply with exactly: Kitchen companion ready.","turn_detection":null}}
```

```json
{"type":"session.update","session":{"modalities":["text"],"input_audio_format":"pcm16","turn_detection":{"type":"server_vad","threshold":0.5,"prefix_padding_ms":300,"silence_duration_ms":500}}}
```

```json
{"type":"conversation.item.create","item":{"type":"message","role":"user","content":[{"type":"input_text","text":"What is visible?"},{"type":"input_image","image_url":"data:image/jpeg;base64,<JPEG_BYTES>"}]}}
```

The VAD probe streams 24 kHz mono PCM16 from `voice/samples/voice_test.wav` and intentionally does **not** send `input_audio_buffer.commit`; it passes only when the server emits `input_audio_buffer.speech_stopped` and completes a response. The audio probe passes only when it receives a nonempty `response.audio.delta`. The image probe passes only when the image item is accepted and produces `response.done` without an error event. Each attempt—successful or not—is appended to `artifacts/yibu_api_calls.jsonl` with a redacted key suffix.

| Capability | Result | Gate evidence |
| --- | --- | --- |
| Audio output (`Tina`) | Pass | Four `response.audio.delta` events; 57,600 audio bytes; clean `response.done`. |
| Realtime voice catalog (56 voices) | Not run intentionally | Not required for the demo; testing all voices would consume 56 extra Realtime turns. Tina is the selected companion voice. |
| Server VAD without manual commit | Pass | The server emitted `input_audio_buffer.speech_stopped`, then `input_audio_buffer.committed`, then `response.done` for the 205,626-byte PCM fixture. |
| JPEG image item in-session | Fail | After `conversation.item.created`, the service returned `COMMON_ERROR`: `InternalError.Algo.InvalidParameter: Invalid video file.` No response was produced. |

Gate decision: **Path B (hybrid HTTP vision)**. Realtime audio and VAD are supported; frame analysis stays on the existing HTTP-capable vision model and injects concise verdicts into the live conversation. This result is sufficient for the demo architecture, so do not spend credits attempting the 56-voice sweep or alternate image encodings unless Path B later proves inadequate.
