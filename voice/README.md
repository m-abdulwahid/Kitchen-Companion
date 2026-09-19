# voice

FastAPI proxy in front of the Omni model. Takes a recorded audio clip and the current cooking step, returns a short spoken-style reply. `OMNI_KEY` stays server-side.

## Run

From this folder, using the root `.env` (see `../.env.example`):

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Smoke test with the sample clip:

```bash
curl -X POST http://localhost:8000/api/voice -F "audio=@samples/voice_test.wav" -F "session_id=t1" -F "current_step=Saute the onions"
```

## Layout

- `app.py`, `yibu_audit.py`: the API (`POST /api/voice`) and the API-call audit logger (writes `../artifacts/yibu_api_calls.jsonl`)
- `test-page/`: standalone push-to-talk page (Vite) for trying the API without the main frontend: `npm install && npm run dev`
- `samples/`: test audio
