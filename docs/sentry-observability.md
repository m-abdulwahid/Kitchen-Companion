# Sentry observability: Phase 5

Phase 5 instruments the actual kitchen demo path instead of adding generic
analytics: camera frame → cooking agent → Omni / Backboard → spoken coaching.

## What is instrumented

- **Errors:** Next.js and FastAPI capture unhandled failures; the camera and
  memory clients also surface failed responses in their traces.
- **Performance tracing:** browser spans cover camera-agent and Backboard-memory
  requests. The voice service creates spans for Omni and Backboard calls and
  records only model name, operation, HTTP status, and token counts.
- **Session Replay:** 10% of sessions and every error session are sampled. All
  text is masked and media is blocked, so the replay never records the recipe,
  saved preferences, microphone data, or camera stream.
- **Profiling:** the Python service profiles traced voice-service sessions.

## Setup

Create a Sentry project and use its DSN in both places:

```env
# root .env (FastAPI service)
SENTRY_DSN=https://public@example.ingest.sentry.io/123
```

```env
# frontend/.env.local (browser)
NEXT_PUBLIC_SENTRY_DSN=https://public@example.ingest.sentry.io/123
```

Restart the frontend and voice service after adding them. A DSN is safe to put
in the browser; do not put a Sentry auth token there.

## Demo evidence for the Sentry challenge

1. Start a cooking session and enable hands-free mode.
2. Use **Check step** or let the camera coach submit one changed frame.
3. In Sentry Performance, inspect the `camera-agent turn` trace and its server
   Omni/Backboard spans to identify the slow edge of the interaction.
4. Trigger a safe failure, such as stopping the voice service and clicking
   **Remember**, then inspect the captured error/session replay. Restore the
   service and demonstrate the recovery message.

This gives the submission two products beyond error monitoring—Performance and
Session Replay—plus backend profiling. The implementation deliberately avoids
capturing raw model prompts, images, audio, recipe text, or memory content.
