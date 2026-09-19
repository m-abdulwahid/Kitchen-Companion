# voice

FastAPI service in front of the Omni model. It gives Pip a voice in both directions: it answers a recorded question with **text and spoken audio**, and reads any text aloud (recipe steps). `OMNI_KEY` stays server-side.

How it fits in: the frontend records the user's question, POSTs it here, and plays the reply. See [../docs/voice-integration.md](../docs/voice-integration.md) for the full flow and [../docs/omni-voice.md](../docs/omni-voice.md) for how Omni hears and speaks (streaming requirement, voices, audio format, gotchas).

## Run

From this folder, using the root `.env` (copy `../.env.example`):

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

## API

`POST /api/voice` (multipart form)

| Field | Type | Notes |
| --- | --- | --- |
| `audio` | file | The recording. webm, mp4, ogg, wav and mp3 are accepted; the format is detected from the file name or content type. |
| `session_id` | text | Any stable id per cooking session. |
| `current_step` | text, optional | The recipe step the user is on, so answers stay in context. |
| `voice` | text, optional | Which voice answers. Any name from `voices.json`; unknown names return HTTP 400. Default: `OMNI_VOICE`. |
| `assistant_name` | text, optional | The name the assistant answers to (up to 30 characters), e.g. `Aiden`. Makes it introduce itself by that name. |
| `style` | text, optional | One line of personality (up to 160 characters), e.g. `High-energy hype chef`. |
| `language` | text, optional | `en`, `fr` or `es`. The answer is given and spoken in that language whatever language the question was in. Default `en`. |

The frontend fills `voice`, `assistant_name`, `style` and `language` from the cooking companion and language the user picked. Line breaks and control characters in `assistant_name` and `style` are removed.

Response (JSON):

```json
{ "text": "Keep stirring until golden.", "audio": "<base64 WAV>", "audio_mime": "audio/wav" }
```

`audio` and `audio_mime` are `null` if Omni returned text only; the frontend then falls back to the browser's speech synthesis. Errors return HTTP 502 with a `detail` message (Omni failure) or 500 (`OMNI_KEY` missing).

`POST /api/speak` (JSON): read text aloud in the same Omni voice, so recipe steps and answers sound like one character.

```json
{ "text": "Step 1. Warm olive oil in a skillet." }
```

Returns the same shape as `/api/voice` (`text` is the text that was spoken, `audio` is a base64 WAV). Details:

- Omni reads the text word for word (tested on steps, feedback lines and a question: read out, not answered).
- Empty text or more than 600 characters returns HTTP 400.
- Results are cached in memory by (voice, text), up to 200 entries, so repeating a step is instant and costs no Omni call. The cache resets when the service restarts.
- A first read takes about as long as the speech itself (3 to 7s for a step), since Omni generates audio at roughly real-time speed.
- Optional `"voice"` reads it in that voice (any name from `voices.json`) instead of `OMNI_VOICE`.
- Optional `"language"` (`en`, `fr`, `es`; default `en`): the text is **translated** into that language and then spoken. The `text` in the reply is the translation, so it can be shown on screen. Other codes return HTTP 400. Details and quality notes: [../docs/omni-voice.md](../docs/omni-voice.md#languages-and-translation). The cache key includes the language.

Smoke test with the sample clip:

```bash
curl -X POST http://localhost:8000/api/voice -F "audio=@samples/voice_test.wav" -F "session_id=t1" -F "current_step=Saute the onions"
```

## Config (root `.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `OMNI_KEY` | none, required | API key |
| `OMNI_BASE_URL` | `https://yibuapi.com/v1` | Omni endpoint |
| `OMNI_MODEL` | `qwen3.5-omni-flash` | Model |
| `OMNI_VOICE` | `Tina` | Spoken voice. Any of the 56 in [the voice library](http://localhost:8000/voices) |
| `VOICE_MOCK` | off | `1` returns a canned text reply without calling Omni |

### Voice library and changing the voice

Open **http://localhost:8000/voices** (with this service running) to see where the voices come from and to hear all 56 of them on any text you type. To use one, set `OMNI_VOICE=Name` in the root `.env` and restart this service (`.env` is read at startup). Full details: [../docs/omni-voice.md](../docs/omni-voice.md#voices).

Related endpoints:

- `GET /api/voices`: the catalog, the voice in use, and what we verified.
- `POST /api/speak` with an optional `"voice": "Aiden"` previews a specific voice without changing the one in use. Unknown names return HTTP 400.

## Layout

- `app.py`, `yibu_audit.py`: the API and the API-call audit logger (writes `../artifacts/yibu_api_calls.jsonl`; every Omni call is logged, with purpose `voice_audio_understanding` or `voice_text_to_speech`)
- `voices.json`, `voices_checked.json`, `static/voices.html`: the voice library (catalog from Alibaba's official list, our test results, and the page). Retest with `python ../scripts/verify_voices.py` (voice venv).
- `test-page/`: standalone push-to-talk page (Vite) for trying the API without the main frontend: `npm install && npm run dev`. It still expects text back and uses the browser's speech synthesis.
- `samples/`: test audio, plus example Omni speech output (`tts_probe_*.wav`) to compare voices by ear
