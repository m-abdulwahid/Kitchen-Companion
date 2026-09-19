# Backboard cooking memory

Phase 4 gives each browser installation an isolated, durable Backboard memory.
It remembers only a fact the cook deliberately saves in **Remy's kitchen
memory**. Examples: `no peanuts`, `likes extra spice`, or `only has oat milk`.

## Setup

1. Create a Backboard API key.
2. Put it in the root `.env`:

   ```env
   BACKBOARD_API_KEY=your_key_here
   ```

3. Restart the voice service on port 8000.

The first saved preference creates one Backboard assistant for that anonymous
browser profile. The browser sends a random local identifier, never a name or
email. Profiles are deliberately separate so one cook's allergy or preference
cannot be retrieved for another cook.

## What happens during cooking

- Clicking **Remember** sends the typed fact to `POST /api/memory`; this makes
  a Backboard memory write and does not call Omni.
- Camera-agent turns semantically retrieve up to three relevant saved facts and
  add a short labelled recap to the Omni cooking prompt.
- Retrieval is cached for three minutes per recipe/step query, so Phase 3's
  camera loop does not make a Backboard request for every frame.
- **Forget** only deletes a close text match in the current browser profile.

If Backboard has no key or is unavailable, the memory control shows an error
but the cooking, camera, and live voice flows continue normally.

## Privacy boundary

Memory is opt-in: the app does not infer or save allergies, dietary choices, or
other personal facts from a camera image or casual conversation. The current
Realtime speech path is intentionally not used to write memories because it
does not yet expose a reliable explicit-consent command to the HTTP agent.
