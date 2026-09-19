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
| `OMNI_VOICE` | `Tina` | Spoken voice: `Tina`, `Ethan` or `Serena` |
| `VOICE_MOCK` | off | `1` returns a canned text reply without calling Omni |

## Layout

- `app.py`, `yibu_audit.py`: the API and the API-call audit logger (writes `../artifacts/yibu_api_calls.jsonl`; every Omni call is logged, with purpose `voice_audio_understanding` or `voice_text_to_speech`)
- `test-page/`: standalone push-to-talk page (Vite) for trying the API without the main frontend: `npm install && npm run dev`. It still expects text back and uses the browser's speech synthesis.
- `samples/`: test audio, plus example Omni speech output (`tts_probe_*.wav`) to compare voices by ear
