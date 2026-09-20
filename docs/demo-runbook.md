# Phase 6: demo runbook

Run this in three terminals from the repository root.

```bash
.venv/bin/uvicorn voice.app:app --reload --port 8000
```

```bash
.venv/bin/uvicorn backend.app:app --reload --port 8001
```

```bash
cd frontend
npm run dev
```

Before opening the app, confirm the credit-free service readiness check:

```bash
curl http://localhost:8000/health
```

Expected shape:

```json
{"ok": true, "sentry_configured": true, "backboard_configured": true}
```

`backboard_configured` stays `false` until `BACKBOARD_API_KEY` is added to the
root `.env`; it does not prevent the Huawei/Sentry demo.

## One unbroken demo

1. Open a recipe and start cooking. Allow camera and microphone access.
2. Save one explicit preference in **Remy's kitchen memory**, such as `no
   peanuts`. This demonstrates consent-based durable memory once Backboard is
   configured; it does not call Omni.
3. Enable hands-free Remy. Show the camera coaching a changed frame, then ask
   a brief cooking question and speak over Remy to interrupt its reply.
4. Let the camera confirm a completed step twice to demonstrate safe automatic
   advancement. Stop after one or two checks to conserve Omni credits.
5. In Sentry, show the `camera-agent turn` trace and the backend span. Session
   Replay is enabled with all text masked and all media blocked.

## Fallbacks

- If you need to avoid Omni use during rehearsal, stop before enabling
  hands-free and use only `/health` and `/voices` to verify services.
- If Backboard is not configured, omit step 2 from the live memory claim; do
  not present it as tested.
- If the camera is unavailable, use the browser permission banner and continue
  with voice, explaining that live camera coaching requires camera access.
