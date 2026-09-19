# Changes to the frontend (for whoever owns it)

What changed in `frontend/` while adding the voice service, and why. Behavior is meant to be identical except where noted. `npx tsc --noEmit` and `npx eslint src` both pass with 0 errors.

## Voice (new)

| File | Change |
| --- | --- |
| `src/lib/voice-api.ts` | New. Calls the voice service (`askVoice`, `speakText`). |
| `src/hooks/useVoiceAssistant.ts` | New. Mic recording, playback, `speak()`, next-step prefetch. |
| `src/components/CookingView.tsx` | "Ask Pip" now records audio and plays Omni's spoken answer (was browser speech recognition plus a mock). Steps, "Repeat aloud" and step-check feedback use `speak()` (was the browser voice). |
| `.env.local` (git-ignored) | `NEXT_PUBLIC_VOICE_API_URL=http://localhost:8000` |

How it works: [voice-integration.md](voice-integration.md).

## Lint fixes (the 3 `react-hooks/set-state-in-effect` errors)

The rule flags calling `setState` directly inside `useEffect`. Each was fixed by computing the value instead:

| File | Was | Now |
| --- | --- | --- |
| `src/hooks/useCookbook.ts` and `src/lib/cookbook-storage.ts` | Effect copied `localStorage` into state on mount, and another effect wrote it back. | Reads and writes `localStorage` through `useSyncExternalStore` (`getCookbookSnapshot`, `subscribeCookbook`, `updateCookbook`). Saves also sync across browser tabs. The unused `ready` flag and `loadCookbook()` were removed. |
| `src/components/KitchenFlow.tsx` | Effect read `?recipe=<id>` and selected that recipe. | The shared recipe is derived while rendering. **Behavior change (bug fix):** before, saving a recipe while on a shared link re-ran the effect and reset the view; now it stays put. Back still returns to the list. |
| `src/components/CookingView.tsx` | Effect set Pip's mood to "talk" for 2.5s on every step change. | Pip's "talk" mood now follows real speech (`voiceState === "speaking"`), and a mood set by an action (e.g. "cheer") is tied to its step so it resets to idle when the step changes. |

## Now unused (safe to delete once the team agrees)

- `answerCookingQuestion` in `src/lib/mocks.ts` (replaced by the voice service)
- `src/types/speech.d.ts` (browser speech-recognition types)

Still mocked and waiting for their owners: `checkStepWithVision` (vision) and `generateRecipeFromVideo` (backend).
