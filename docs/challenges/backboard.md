# Built on Backboard — Kitchen Companion

## Submission summary

Kitchen Companion uses Backboard as a durable, privacy-scoped kitchen memory.
It lets a cook explicitly save a preference such as “I am allergic to peanuts”
once, then carries that preference into a later recipe without turning all
conversation or camera footage into permanent memory.

This changes the cooking experience from a stateless assistant to one that can
make safer, personal guidance across sessions—for example, recognizing the
allergy when the cook starts a new noodle recipe and asks what Ella knows about
their dietary needs.

## How we use Backboard

| Backboard capability | Implementation |
| --- | --- |
| Durable memory | `voice/backboard_memory.py` creates a Backboard assistant for each anonymous browser profile and writes an explicit fact to that assistant’s memory. |
| Relevant retrieval | The current recipe title, cooking step, and a narrow preference query retrieve at most three relevant memories. The result is added as a labelled recap to the cooking prompt. |
| Cross-session continuity | A new hands-free voice session retrieves the same browser profile’s saved preferences before its OMNI Realtime session is configured. |
| Explicit voice control | “Ella, remember that I am allergic to peanuts” and “Ella, forget that I avoid peanuts” are recognized from the live input transcript. Only `remember` and `forget` commands write or delete memory. |
| State management | Per-session cooking state remains local to the cooking agent, while durable preferences live in Backboard. This prevents a new recipe from inheriting stale timers or step state. |

## Privacy model

Backboard is used conservatively because allergies and food preferences can be
sensitive.

- The browser creates a random local profile ID; it is not a person’s name,
  email, or account identifier.
- Each profile gets its own Backboard assistant, so one browser profile cannot
  retrieve another cook’s memories.
- Casual statements, camera frames, and general voice conversation are not
  stored. A write requires the unambiguous `remember` command or the explicit
  **Remember** button.
- **Forget** deletes only a close textual match from that same profile.
- Retrieval is cached for three minutes per profile/query to avoid redundant
  calls during camera coaching.

## Demo scenario

1. Start any recipe and enable hands-free Ella.
2. Say, “Ella, remember that I am allergic to peanuts.” The browser receives a
   saved-memory confirmation while Backboard stores the explicit preference.
3. End the session, open **Indomie Instant Noodles** or another recipe, and
   start a new hands-free session in the same normal browser profile.
4. Ask, “Do you know if I have any allergies?” Ella receives the recalled,
   profile-scoped preference in her live cooking instructions and can answer.
5. Optionally say, “Ella, forget that I am allergic to peanuts,” then repeat
   the question to demonstrate user control.

The same feature can be demonstrated without voice through the **Ella’s
kitchen memory** card. Type a fact and use **Remember** or **Forget**.

## Technical flow

```text
Explicit typed/voice command
        │
        ├─► anonymous browser profile ID
        ├─► Backboard assistant dedicated to that profile
        └─► explicit memory write/delete

New recipe session ─► relevant Backboard retrieval ─► labelled context in Ella's prompt
```

The application degrades safely: if `BACKBOARD_API_KEY` is absent or Backboard
is unavailable, cooking still works and the user sees a memory-specific error.
No Omni key is sent to Backboard and no Backboard key is exposed to the browser.

## Evidence in the repository

- `voice/backboard_memory.py` — assistant isolation, explicit command parser,
  memory writes/deletes, retrieval, cache, and input limits.
- `voice/app.py` — memory API for the opt-in card and retrieval for image-agent
  turns.
- `backend/app.py` — retrieval at live-session start and explicit voice-command
  persistence from provider transcription events.
- `frontend/src/lib/cooking-profile.ts` — anonymous browser-local profile ID.
- `frontend/src/hooks/useLiveSession.ts` — sends only that profile ID with the
  live session and presents save/delete status.
- `voice/tests/test_backboard_memory.py` and `backend/test_app.py` — no-network
  tests for consent parsing and voice-memory prompt refresh.

## Setup

Set `BACKBOARD_API_KEY` in root `.env`, then restart the services on ports 8000
and 8001. `GET http://localhost:8000/health` reports
`"backboard_configured": true` without exposing the key. See the fuller
[memory guide](../backboard-memory.md) for local setup and failure behavior.
