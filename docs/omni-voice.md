# Omni voice: how speech in and speech out works

Omni (`qwen3.5-omni-flash` via yibuapi) does both hearing and speaking, so the voice service needs no separate speech-to-text or text-to-speech provider. This page records what we tested and what the API actually does. Reproduce it with `python scripts/probe_tts.py [Voice]` (needs `OMNI_KEY` in `.env`; calls are logged to `artifacts/yibu_api_calls.jsonl` with purpose `tts_probe`).

Tested: 2026-09-19, model `qwen3.5-omni-flash`, endpoint `POST https://yibuapi.com/v1/chat/completions`.

## Summary

| Question | Answer |
| --- | --- |
| Can Omni return spoken audio over HTTP? | Yes, but **only with `stream: true`**. |
| Can one call take the user's recorded audio and reply with speech? | Yes. Audio in, text and audio out, one request. |
| Which voices work? | `Tina`, `Ethan`, `Serena`. `Cherry` and `Chelsie` are rejected. |
| Audio format returned | Base64 chunks of raw PCM, no WAV header. Assumed 24 kHz, 16-bit, mono (see below). |
| Latency (short answer) | First audio chunk about 1.7s. Audio in, audio out: first chunk about 2.8s, complete in about 4.5s. |

## Request

Same as text chat, plus three fields:

```json
{
  "model": "qwen3.5-omni-flash",
  "messages": [
    {"role": "system", "content": "You are a sous-chef. Answer in one or two short plain sentences."},
    {"role": "user", "content": [
      {"type": "input_audio", "input_audio": {"data": "data:audio/wav;base64,<...>", "format": "wav"}}
    ]}
  ],
  "modalities": ["text", "audio"],
  "audio": {"voice": "Tina", "format": "wav"},
  "stream": true,
  "stream_options": {"include_usage": true}
}
```

Text-only input works the same way (`"content": "some text"`), which is how the assistant can speak a recipe step aloud.

## Response (server-sent events)

Each `data:` line is a JSON chunk. Per chunk, in `choices[0].delta`:

- `delta.audio.data`: base64 audio bytes. Concatenate the decoded bytes of all chunks in order.
- `delta.audio.transcript`: text of what is being spoken (also arrives as `delta.content` in some chunks). Use it for on-screen captions.
- The final chunk has `usage`. The stream ends with `data: [DONE]`.
- Errors arrive **inside the stream with HTTP 200**, as a `data: {"error": {...}}` line. Always check for `error` in events, not just the status code.

## Audio format

- Chunks are raw PCM with no header (`RIFF`), even though `format: "wav"` is requested. To make a playable file, prepend a WAV header.
- The sample rate is not stated by the API. We infer **24 kHz, 16-bit, mono** from speech pace: at that rate the clips run about 3 words per second, which is natural speech. If voices ever sound too fast or slow, this is the first thing to check.
- Sample outputs to listen to are in `voice/samples/` (`tts_probe_b-ethan.wav`, `-serena`, `-tina`, `tts_probe_c-audio-in-audio-out.wav`).

## Gotchas

1. **Non-streaming returns no audio.** With `stream: false` the call succeeds (HTTP 200, text present) but `message.audio` is missing, while audio tokens are still billed. Never request audio without `stream: true`.
2. **A bad voice name fails softly in streams.** HTTP 200 plus an error line inside the stream. Non-streaming returns a clean 400 (`Voice 'X' is not supported`).
3. **Spoken length is expensive.** The assistant's system prompt asks for "one or two short sentences", but it can still produce ~35 words (about 12s of speech). Keep the prompt strict about length, since every second of speech is latency and cost.

## Text to speech (reading text aloud)

There is no separate TTS endpoint. `POST /api/speak` sends the text to the same chat endpoint with a system prompt: "You are a text-to-speech engine. Read the user's message aloud exactly as written, word for word..." (see `SPEAK_PROMPT` in `voice/app.py`).

Tested 2026-09-19 on four inputs (two recipe steps, a feedback sentence, and a question). All four came back word for word, and the question was read out rather than answered. Generation runs at about real-time speed: a 5s clip took about 4.4s, a 7s clip about 4.6s. So a step's first read has a delay roughly its own length; repeats come from the cache.

## Decisions for the voice service

- Use `Tina` as the default voice until the team picks one (listen to the samples above). Keep it in `.env` as `OMNI_VOICE`.
- First version: the server reads the whole stream, wraps the PCM in a WAV header and returns it in the existing `audio` field of `POST /api/voice` as base64. Simple, about 4.5s end to end.
- Later optimization, only if latency hurts in the demo: forward the stream to the browser and play chunks as they arrive (first audio about 2.8s).
- Browser `speechSynthesis` stays only as a fallback if Omni audio fails.
- Recipe steps are read with the same Omni voice through `/api/speak` (see [voice-integration.md](voice-integration.md)).
