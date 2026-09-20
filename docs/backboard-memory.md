# Backboard cooking memory

Phase 4 gives each browser installation an isolated, durable Backboard memory.
It remembers only a fact the cook deliberately saves in **Ella's kitchen
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
- In hands-free mode, the cook can say **“Ella, remember that I am allergic to
  peanuts”** or **“Forget that I avoid peanuts.”** Only an utterance beginning
  with `remember` or `forget` is saved; casual conversation is never stored.
- A new hands-free session retrieves up to three relevant preferences before
  its Omni Realtime connection is configured. This lets Ella answer a new
  recipe question such as “Do you know if I have any allergies?”
- Camera-agent turns semantically retrieve up to three relevant saved facts and
  add a short labelled recap to the Omni cooking prompt.
- Retrieval is cached for three minutes per recipe/step query, so Phase 3's
  camera loop does not make a Backboard request for every frame.
- **Forget** only deletes a close text match in the current browser profile.

If Backboard has no key or is unavailable, the memory control shows an error
but the cooking, camera, and live voice flows continue normally.

## Privacy boundary

Memory stays scoped to the kitchen. A clear first-person food taste such as “I
hate bananas” is saved as a cooking preference, so Ella can avoid suggesting
that ingredient next time. Allergies, dietary choices, and other potentially
sensitive facts are never inferred from a camera image or casual conversation:
they still require an unambiguous `remember` or `forget` command. All memories
stay isolated to the same anonymous browser profile.
