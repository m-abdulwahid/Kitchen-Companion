# Sentry — Kitchen Companion

## Submission summary

Kitchen Companion instruments the real kitchen interaction, not a generic page
view: camera frame → cooking agent → OMNI/Backboard → spoken coaching. Sentry
helps us identify where the experience becomes slow or fails while preserving
the privacy expected of a camera-and-voice cooking app.

## Sentry products used

| Product | How Kitchen Companion uses it |
| --- | --- |
| Error Monitoring | The Next.js client/server/edge SDKs and FastAPI SDK capture unhandled errors. Frontend camera and memory requests surface failed response status in their spans. |
| Performance Tracing | The browser creates a `camera-agent turn` span. The Python service adds OMNI and Backboard spans with operation name, model/status, and token counts. The trace shows which leg is slow. |
| Session Replay | 10% of browser sessions and every error session are sampled. All text is masked and all media is blocked, so replays do not contain recipe text, camera video, microphone data, or saved preferences. |
| Profiling | The FastAPI voice service enables Sentry profiling for traced sessions, giving us server-side evidence when the agent or provider layer is expensive. |

This exceeds the challenge requirement of two products beyond error monitoring:
we use tracing, Session Replay, and profiling.

## Architecture and data boundary

```text
Browser camera-agent span
        │
        ├─ POST /api/agent/turn ─► FastAPI span ─► OMNI span
        │                                      └► Backboard span (when used)
        └─ Sentry tunnel /monitoring ─► Sentry project
```

The browser uses a `/monitoring` tunnel rather than exposing direct ingest
traffic in application code. CORS permits Sentry trace headers for the local
voice and Realtime relay services.

We intentionally never attach raw prompts, recipe text, photos, audio,
transcripts, or memory facts to Sentry. Backend spans record only technical
metadata such as model, HTTP status, and token totals. Browser replay masks text
and blocks camera/video media.

## How observability shaped the product

- Camera checks are rate-limited to changed frames every five seconds and capped
  at 12 per hands-free session. A named `camera-agent turn` span makes the cost
  and latency of that decision visible instead of hiding it inside a general
  request.
- The image agent, Backboard memory, and live voice services fail independently.
  Instrumenting each boundary makes a refusal on port 8000, a memory-service
  failure, or a slow model request diagnosable without collecting cooking data.
- The UI has a safe fallback message for unavailable services; an error replay
  can show the recovery path while still masking personal content.

## Judge demo

1. Confirm both DSNs are configured: `SENTRY_DSN` in root `.env` and
   `NEXT_PUBLIC_SENTRY_DSN` in `frontend/.env.local`.
2. Open a recipe and perform one **Check step** action, or allow exactly one
   changed camera frame while hands-free is active.
3. Open Sentry Performance and inspect the `camera-agent turn` transaction and
   its backend OMNI/Backboard spans.
4. In a private/local testing window with extensions disabled, trigger a small
   application error and show the captured issue plus its masked replay.
5. Restore the service and show the app’s friendly error/recovery state.

An ad/privacy blocker can block the local `/monitoring` request with
`ERR_BLOCKED_BY_CLIENT`; allowlist `localhost:3000/monitoring` or use a private
window with extensions disabled before capturing the demo evidence.

## Evidence in the repository

- `frontend/instrumentation-client.ts`, `instrumentation.ts`, and
  `sentry.*.config.ts` — Next.js initialization, tracing, and masked replay.
- `frontend/next.config.ts` — Sentry wrapper, optional source-map upload, and
  `/monitoring` tunnel.
- `frontend/src/lib/cooking-agent-api.ts` and `memory-api.ts` — meaningful
  browser spans around the camera and memory actions.
- `voice/app.py` and `voice/backboard_memory.py` — FastAPI initialization and
  privacy-safe OMNI/Backboard spans.

See [the detailed observability guide](../sentry-observability.md) for setup,
source-map configuration, and the full local verification procedure.
