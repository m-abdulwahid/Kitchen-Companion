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
| API usage page and report files for the organisers | Real | http://localhost:8000/usage (password protected), see [usage-reporting.md](usage-reporting.md). Due 2026-09-20, 11:59 PM Eastern. |
| Check my step (vision) | Real, lightly tested | Camera photo goes to Omni, which says whether the step looks done. See below. |
| **Recipe from a TikTok / Instagram link** | **Placeholder** | `generateRecipeFromVideo` in `frontend/src/lib/mocks.ts` returns a made-up recipe. Backend work. |
| Backend service, accounts, shared cookbook | Not started | `backend/` holds only a README. |
| V2: where to buy food, nutrition | Not started | Deferred. |

## Vision ("Check my step")

- **Service:** `POST /api/vision/check` in the voice service sends a photo (and optionally the step) to Omni and returns `{ seen, passed, feedback }`. A call takes about 2 seconds and about 400 tokens. See [voice/README.md](../voice/README.md#api).
- **App:** the **Check step** button takes a photo from the live camera and calls `checkStepWithVision` in `frontend/src/lib/voice-api.ts`. The feedback shows in the companion's bubble and is read aloud in the chosen voice and language. If the voice service is down, the companion says it couldn't check the step and the button works again.
- **Test page:** http://localhost:8000/vision shows the camera and what Omni says about it in real time, with no recipe needed.
- **How well it works:** on 5 real food photos (golden and pale onions, raw onions, a field) the answers were sensible and it did not just say "looks good". That is a small sample. It has not been tried on a live cooking video, only a fake camera. Use the test page while cooking, then tune the prompt in `voice/vision.py`.
