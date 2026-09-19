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
