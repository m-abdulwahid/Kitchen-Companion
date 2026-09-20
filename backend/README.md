# Live relay backend

This FastAPI service owns the Omni Realtime WebSocket connection. The browser
only connects to this relay, so `OMNI_KEY` remains in the root `.env` and never
appears in frontend code.

## Run

From the repository root:

```bash
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.app:app --reload --port 8001
```

Then verify it without spending model credits:

```bash
.venv/bin/python -m unittest backend.test_app
curl http://localhost:8001/health
```

## Browser relay protocol

Connect to `ws://localhost:8001/api/live/<session-id>`, then send this as the
first JSON message:

```json
{
  "type": "session.configure",
  "recipe_title": "Cozy Shakshuka",
  "current_step": "Soften onion and pepper.",
  "memory_profile_id": "an-anonymous-browser-local-id",
  "companion": {
    "name": "Remy",
    "style": "Warm, precise, and encouraging.",
    "voice": "Tina",
    "language": "en"
  }
}
```

The server replies with `relay.ready`. Send raw binary PCM16 microphone chunks
after that. Send `{"type":"step","current_step":"..."}` to refresh
recipe context, `{"type":"interrupt"}` to cancel a spoken reply, or
`{"type":"proactive","text":"..."}` to speak a camera-coach update.
Provider events, including `response.audio.delta`, are relayed to the browser unchanged.

When `BACKBOARD_API_KEY` is configured, the optional `memory_profile_id` is
used only to retrieve that browser's explicit cooking preferences before the
Realtime session starts. A spoken phrase beginning with `remember` or `forget`
is saved or removed, then the live prompt is refreshed. The relay sends a
`relay.memory` event to confirm the outcome; it never persists casual speech.

## Config

The shared root `.env` needs `OMNI_KEY`. Optional variables:

| Variable | Default |
| --- | --- |
| `OMNI_REALTIME_MODEL` | `qwen3.5-omni-plus-realtime` |
| `OMNI_REALTIME_ENDPOINT` | `wss://yibuapi.com/v1/realtime` |
| `BACKBOARD_API_KEY` | none; enables opt-in browser-local cooking memory |
