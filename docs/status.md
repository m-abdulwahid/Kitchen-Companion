# Status: what is real and what is a placeholder

Last updated 2026-09-19. Checked against the code, not from memory.

| Feature | Real? | Details |
| --- | --- | --- |
| Explore, cookbook, upload pages, search, diet filters, share link | Real | Cookbook is saved in the browser only (`localStorage`), not on a server. |
| Camera preview in the cooking view | Real | Shows your webcam. |
| Pip reads steps aloud | Real | Omni voice, via the voice service. See [voice-integration.md](voice-integration.md). |
| Ask Pip (speak a question, hear an answer) | Real | Omni hears the audio and answers in the chosen voice. |
| Voice library (browse and preview 56 voices) | Real | http://localhost:8000/voices, see [omni-voice.md](omni-voice.md#voices). |
| Choose a cooking companion (Aiden, Tina, Jennifer, Ryan, Mione) | Real | Each has an Omni voice and personality, with a Listen button. See [voice-integration.md](voice-integration.md#cooking-companions-and-languages). |
| Speak and answer in English, French or Spanish | Real, machine-translated | Translations are made by Omni as it speaks. Read by us, not checked by a native speaker; the app's own labels stay English. See [omni-voice.md](omni-voice.md#languages-and-translation). |
| **Check my step (vision)** | **Placeholder** | See below. |
| **Recipe from a TikTok / Instagram link** | **Placeholder** | `generateRecipeFromVideo` in `frontend/src/lib/mocks.ts` returns a made-up recipe. Backend work. |
| Hands-free live voice | Implemented; needs one browser microphone validation | `frontend/src/hooks/useLiveSession.ts` captures/resamples microphone audio to 24 kHz PCM16 in an AudioWorklet, streams it through `backend/app.py`, queues reply audio, and cancels it when server VAD detects the cook speaking. The existing HTTP voice path remains available. Live mode uses Tina, the only Realtime-validated voice. |
| Live Realtime relay backend | Real | `backend/app.py` runs on port 8001. It keeps `OMNI_KEY` server-side, accepts PCM16 browser audio, enables the verified server VAD setup, forwards Omni audio events, and supports recipe-step updates/interruption. It has credit-free protocol tests. |
| Accounts, shared cookbook | Not started | Browser cookbook storage remains local-only. |
| V2: where to buy food, nutrition | Not started | Deferred. |

## Vision ("Check my step"): the camera works, the checking does not

What happens when you press **Check my step**:

1. The app takes a real photo (JPEG) from the live camera. **This part is real.**
2. It passes the photo to `checkStepWithVision` in `frontend/src/lib/mocks.ts`.
3. That function **ignores the photo** (the parameter is named `_imageDataUrl` and never used), waits a fake 1.2 seconds, and always answers "step N looks on track". It always reports success.

So Pip cannot see anything yet. No vision model is called, `vision/` contains only a README, and the audit log shows no image request to Omni ever. Omni is expected to accept images (the API takes an `image_url` with a base64 data URI, as in `docs/omni-notes.md`), but that has not been tested.

To make it real, the contract is already defined by the mock: send a photo and the current step text, get back `{ passed: boolean, feedback: string }`. Once it works, Pip reads the feedback aloud with the Omni voice already; nothing else in the frontend needs to change.
