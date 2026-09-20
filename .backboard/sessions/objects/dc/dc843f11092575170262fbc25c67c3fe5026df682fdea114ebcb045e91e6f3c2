# Omni voice: how speech in and speech out works

Omni (`qwen3.5-omni-flash` via yibuapi) does both hearing and speaking, so the voice service needs no separate speech-to-text or text-to-speech provider. This page records what we tested and what the API actually does. Reproduce it with `python scripts/probe_tts.py [Voice]` (needs `OMNI_KEY` in `.env`; calls are logged to `artifacts/yibu_api_calls.jsonl` with purpose `tts_probe`).

Tested: 2026-09-19, model `qwen3.5-omni-flash`, endpoint `POST https://yibuapi.com/v1/chat/completions`.

## Summary

| Question | Answer |
| --- | --- |
| Can Omni return spoken audio over HTTP? | Yes, but **only with `stream: true`**. |
| Can one call take the user's recorded audio and reply with speech? | Yes. Audio in, text and audio out, one request. |
| Which voices work? | 56 built-in voices, all verified on `qwen3.5-omni-flash` (see Voices below). Names from older Qwen models, such as `Cherry` and `Chelsie`, are rejected. |
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

## Voices

### Where Pip's voice comes from

- It is one of the **built-in voices of Alibaba Cloud's Qwen3.5-Omni model**, reached through yibuapi. You choose a voice by name with `OMNI_VOICE`. There is no separate voice service, no cloning and no custom voices, unlike ElevenLabs.
- **Official list:** [Alibaba Cloud: voices supported by Qwen-Omni](https://www.alibabacloud.com/help/en/model-studio/omni-voice-list). For Qwen3.5-Omni it gives each voice a name, gender and short description, and marks `Tina` as the default. It has **no audio samples**, which is why we built the library page below. (Its header says 50 voices but its table has 56; we use the table, and all 56 passed our test.)
- **Our copy:** `voice/voices.json` is the catalog, copied by hand from that page. `voice/voices_checked.json` holds the test results, made by `python scripts/verify_voices.py`.
- **Older names don't work.** `Cherry`, `Chelsie`, `Vivian`, `Moon` and `Pip` belong to the older Qwen3-Omni-Flash and Qwen-Omni-Turbo models. The 3.5 models reject them (`Voice 'Cherry' is not supported`).

### The voice library page

With the voice service running, open **http://localhost:8000/voices**. It shows where the voices come from (provider, model, link to the official list), which voice is in use, and all 56 voices with gender, description and whether we verified them. Type any sentence, press **Preview** on a voice and hear it in that voice. You can search, filter by gender, and copy the `.env` line for a voice. Previews don't change the voice in use.

Behind it: `GET /api/voices` returns the catalog, and `POST /api/speak` accepts an optional `"voice"` to preview any catalog voice (unknown names return HTTP 400). Previews are cached like any other read.

### What we tested

- **All 56 voices** accept the request and return audio on `qwen3.5-omni-flash` (2026-09-19, one short sentence each). Only `Tina` was also tried on `qwen3.5-omni-plus`, so re-test with `python scripts/verify_voices.py` after changing `OMNI_MODEL`.
- **Audit log note.** The first full run (56 calls, 2026-09-19 around 15:08 UTC) produced only 55 `voice_verify` records in `artifacts/yibu_api_calls.jsonl`: the audit writer is not safe for several threads on Windows and one record was overwritten. The call itself succeeded. We did not invent a replacement record. `scripts/verify_voices.py` now locks its audit writes (checked: 8 calls, 8 records). Anything else that writes the audit log from several threads should do the same.
- **Loudness differs by voice.** In our first three clips, Tina came out about 2.3 times louder than Ethan and Serena (RMS 3757 vs about 1600, roughly 7 dB). The other voices were not measured. If you switch voices and it suddenly seems quiet or loud, that is the voice, not a bug.
- **Nobody has judged the voices by ear yet.** The descriptions are Alibaba's, not ours. Judge with the library page.
- **English:** Alibaba describes `Jennifer` (American, "cinematic quality"), `Aiden` (American, "skilled in cooking"), `Ryan` (high-energy, dramatic) and `Mione` (British) as English-accent voices. Voices described with a Chinese regional dialect (Sichuan, Cantonese and so on) have not been tried on English, and may sound off. Most voices are listed as supporting 29 languages; `Bea` supports only Mandarin and English.

### How to change the voice

1. Find a voice on the library page and press **Copy .env line**, or write it yourself, for example `OMNI_VOICE=Aiden`. Names with a space work as written (`OMNI_VOICE=Liora Mira`).
2. Put it in the root `.env`.
3. Restart the voice service (`.env` is read only at startup). The frontend needs no change.
4. Reload the site. Old audio is not reused: the service's cache is keyed by voice and text, and restarting clears it.

If `OMNI_VOICE` is not in the catalog, the service prints a warning at startup.

## Comparing models, voices and prompts

`python scripts/compare_voices.py` (run with the voice venv) reads one sentence with several model, voice and prompt combinations and saves the clips to `voice/samples/compare/`, so they can be compared by ear. It logs every call in the audit file (purpose `voice_compare`). "Warm" is a prompt that keeps the read-word-for-word rule but adds delivery instructions (friendly, expressive, natural rhythm; see `WARM_PROMPT` in the script). "Current" is the prompt `/api/speak` uses today.

Results of the first run (2026-09-19, one sentence, one run each, so timings are noisy):

| Model / voice / prompt | Audio | Same words? | Pitch spread* |
| --- | --- | --- | --- |
| `qwen3.5-omni-flash` / Tina / current | 6.3s | yes | 12.5 semitones |
| `qwen3.5-omni-flash` / Tina / warm | 6.3s | yes | 14.3 |
| `qwen3.5-omni-flash` / Ethan / warm | 5.2s | yes | 11.7 |
| `qwen3.5-omni-flash` / Serena / warm | 5.7s | yes | 10.5 |
| `qwen3.5-omni-plus` / Tina / warm | 6.0s | yes | 11.8 |
| `qwen3.8-omni-flash` / Tina / warm | none | | Rejected: "does not support the modalities" (no audio output) |

*Spread of the voice's pitch across the clip (5th to 95th percentile), a rough measure of how monotone it is; flatter speech is usually what sounds robotic. It is only a proxy and says nothing about voice quality. **Nobody has judged these by ear yet.** Listen and decide.

What this tells us so far:

- `qwen3.8-omni-flash` cannot be used for voice output.
- `qwen3.5-omni-plus` works with the same voices and code (`OMNI_MODEL=qwen3.5-omni-plus`); whether it sounds better is unknown.
- Adding a delivery instruction to the prompt did not change the words, and Tina's pitch varied a little more with it. It has not been applied to the service yet; `SPEAK_PROMPT` in `voice/app.py` is unchanged.
- If a clip sounds robotic, first check that it really is Omni's voice and not the browser's built-in one (see Troubleshooting in [voice-integration.md](voice-integration.md)).

## Languages and translation

Yes, the voices can speak other languages, and Omni translates as it speaks. Alibaba lists 29 languages for these voices, including English, French and Spanish, the three the app offers (`en`, `fr`, `es`). The list lives in `LANGUAGES` in `voice/app.py`; to add a language, add a line there and in `frontend/src/lib/languages.ts`. English is the source language and is never translated.

**How it works.** With a `language` other than English, `/api/speak` uses a different system prompt (`TRANSLATE_PROMPT` in `voice/app.py`): translate the message into that language the way a cook would say it, keep labels like "Step 2", then read the translation aloud. It is still **one Omni call**: the reply's text is the translation and the audio is that translation spoken. Time is about the same as English (3 to 4s for a step). `/api/voice` adds "Always answer in <language>" to its prompt, so a question in any language gets an answer in the chosen one.

**Tested 2026-09-19** (translations read by us, not by a native speaker): Aiden, Tina, Jennifer, Mione and Ryan were each tried on one step in French or Spanish (six combinations), then all five steps of the Cozy Shakshuka recipe were tried in both languages with Aiden.

- All combinations returned translated text plus audio. English still reads word for word.
- **Found and fixed with the prompt:** the first prompt dropped the "Step 1" label once (Spanish, in the browser test), and translated "crack in the eggs" as making cracks *in* the eggs ("des fissures dans les œufs", "grietas en los huevos"). After adding the cooking context and "translate every part including labels", all 10 step labels were kept and the eggs came out right ("cassez-y les œufs", "rompe los huevos dentro").
- **Remaining blemishes:** the Spanish step 5 came back in the infinitive ("Esparcir…") while the other steps use commands, and "sente le toasté" is a literal French phrase for "smells toasty". Understandable, not perfect.
- **Not judged by ear:** we did not listen for accent or pronunciation. Voices such as Aiden are described as American, so an accent in French or Spanish is possible.

Treat the translations as machine translations. For a demo, read the translated steps once, and for anything important write the translation by hand instead. The translation is generated per request and cached (per voice, language and text), so a step is translated once until the service restarts.

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
