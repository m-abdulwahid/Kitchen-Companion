# Huawei OMNI Live — Kitchen Companion

## Submission summary

Kitchen Companion is a hands-free cooking assistant for the point in a recipe
where a cook’s hands are messy, their attention is on the pan, and a text chat
is not enough. The browser uses the phone/laptop camera and microphone as the
edge endpoint. OMNI hears the cook, speaks short coaching replies, and reasons
about an image of the active cooking step.

The multimodal advantage is deliberate: a recipe alone cannot tell whether the
pan is ready, and a camera alone cannot know which step the cook is on or what
they just asked. Kitchen Companion combines the live recipe context, voice,
and visual state to give a useful next action.

## How we use OMNI

| Capability | Implementation | Why it matters in the kitchen |
| --- | --- | --- |
| Real-time speech in and spoken audio out | The browser records 24 kHz PCM16 through an AudioWorklet and sends it over a WebSocket to `backend/app.py`. The relay opens the server-side OMNI Realtime connection using `qwen3.5-omni-plus-realtime`; credentials never enter browser code. | The cook can ask a question without stopping to type. |
| Server voice activity detection and interruption | The Realtime session uses server VAD. When the cook starts speaking during a reply, playback is cancelled and the new utterance wins. | Conversation can be natural rather than turn-taking with a button. |
| Image understanding | A changed 640 px JPEG camera frame is sent to the HTTP cooking agent, which supplies the recipe, active step, and image to `qwen3.5-omni-flash`. | The response is about *this* pan and *this* step, not generic recipe advice. |
| Language and recipe reasoning | The prompt includes recipe title, current step, companion style, selected language, timers, and safe action rules. | The assistant can answer a cooking question in context and guide the next action. |
| Natural audio output | OMNI returns PCM audio chunks that the browser schedules onto one Web Audio timeline. Tina is the Realtime voice we validated in the provider integration. | Coaching is spoken while the cook continues working. |

## Architecture

```text
Camera + microphone in browser
        │
        ├─ PCM16 WebSocket ───────────────► FastAPI Realtime relay :8001
        │                                      └─► OMNI Realtime (hear + speak)
        │
        └─ changed JPEG every ≥5 seconds ─► Cooking agent :8000
                                               └─► OMNI HTTP (image + recipe reasoning)
```

The split is intentional. The live relay keeps the low-latency voice stream
open, while the image agent performs bounded visual checks without trying to
send arbitrary video files to the Realtime endpoint. Our initial Realtime JPEG
probe returned `Invalid video file`, so the implemented HTTP image path is the
tested fallback rather than an unverified claim.

## Complete demo scenario

1. Open **Indomie Instant Noodles** and start cooking; allow camera and
   microphone access.
2. Enable hands-free Ella and ask, “What is the current step?” Ella hears the
   question and answers aloud through OMNI Realtime.
3. Briefly show the pot/pan to the camera. The app sends a changed frame with
   the active recipe step; Ella gives a visual coaching update.
4. Speak while Ella is talking. The current reply stops and the new utterance
   is handled, demonstrating interruption.
5. Advance a step or let two credible visual confirmations trigger the guarded
   auto-advance rule.

This is one uninterrupted end-to-end flow using vision/video, speech/audio,
and language together—not three disconnected feature demos.

## Reliability, cost, and safety choices

- Camera frames are JPEG-compressed, compared locally for change, sent no more
  often than every five seconds, and capped at 12 per hands-free session.
- The visual model cannot directly advance the recipe from one optimistic
  frame. Two credible completed-step observations are required, and unsafe or
  malformed actions are dropped by deterministic server rules.
- The live relay permits only a small set of client controls (`step`,
  `interrupt`, text, and proactive camera updates); it does not proxy arbitrary
  provider events.
- OMNI keys stay in the root `.env` on the server. The browser receives audio,
  captions, and safe relay events only.

## Evidence in the repository

- `backend/app.py` — Realtime WebSocket relay, VAD configuration, interruption,
  and server-side credential boundary.
- `frontend/src/hooks/useLiveSession.ts` — PCM capture, audio playback queue,
  and live-session lifecycle.
- `frontend/src/hooks/useCookingAgent.ts` — changed-frame, interval, and
  credit-cap policy.
- `voice/app.py` and `voice/agent.py` — image-plus-recipe decision pipeline and
  action guardrails.
- `scripts/probe_realtime.py` — credit-conscious provider probes; audio and VAD
  were validated before the full UI was built.

## Run

Follow [the demo runbook](../demo-runbook.md). The only secret needed for the
OMNI flow is `OMNI_KEY` in the root `.env`.
