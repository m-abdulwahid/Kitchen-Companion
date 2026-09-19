# Voice integration: "Ask Pip" end to end

Pip's whole voice comes from the voice service, which uses Omni. It hears the user's question and speaks the answer ("Ask Pip"), and it reads recipe steps and feedback aloud. Pip has one voice, and no separate speech-to-text or text-to-speech provider is involved.

```
Browser (frontend)                     voice service (voice/)               Omni
──────────────────                     ──────────────────────               ────
tap "Ask Pip"  -> record mic
tap again      -> POST /api/voice  ->  audio + current step  ->  chat/completions (stream)
                                       collect text + PCM audio  <-  SSE chunks
                  <- {text, audio}  <- wrap PCM as WAV
show text, play audio

step shown     -> POST /api/speak  ->  cached? reply at once
"Step 1. ..."                          else "read this aloud" -> Omni  (same streaming path)
                  <- {text, audio}  <- cache, then play audio
```

## Try it

1. Root `.env` has `OMNI_KEY` (see `.env.example`).
2. Start the voice service on port 8000 (commands in [voice/README.md](../voice/README.md)).
3. Start the frontend: `cd frontend && npm run dev`, open http://localhost:3000.
4. Open a recipe, click **Start cooking with Pip**, allow camera and microphone.
5. Click **Ask Pip**, ask a question, click again to send. Pip's answer appears and is spoken.

## How the button behaves

| State | Button says | What happens next |
| --- | --- | --- |
| idle | Ask Pip | Tap to start recording |
| recording | Listening… tap to send | Tap to send. Auto-sends after 15s. Under 0.5s is discarded ("Too short"). |
| thinking | Pip is thinking… | Disabled while the service answers (about 4s) |
| speaking | Pip is talking, tap to interrupt | Tapping stops the speech and starts a new recording |

If the service returns text without audio, or is down, the browser's own voice reads the text instead, so Pip is never silent. If the service is down when you ask a question, the status line says so.

## When Pip reads things aloud

`speak(text)` in the hook is used for:

- **Each new step**, as "Step N. <step text>", when the step appears.
- **Repeat aloud**, with exactly the same text, so it comes from the service's cache and starts almost instantly (about 0.1s).
- **Check my step** feedback and the "last step" message.

### Prefetch: the next step is ready before you need it

When a step's audio arrives, the hook quietly asks the voice service for the **next** step's audio too (`speak(text, upcoming)`). The service caches it, so tapping **Next step** starts speaking in about 0.2s instead of waiting 3 to 7s. Details:

- Only one step ahead, and only after the current step's audio has arrived, so it never slows the step being read. Each step you reach prefetches the one after it.
- It costs one extra Omni call per step, and never a duplicate: a step already read or prefetched is served from the cache. (A test run of two full flows added only 4 calls to the audit log.)
- If a prefetch fails it is ignored; the step is simply generated when you get there.
- Going **Back** is instant too, since that step was already read.

Rules: there is one audio player. A new `speak()` replaces an older one (so tapping Next quickly only reads the last step). While you are recording a question or waiting for an answer, `speak()` is ignored, and tapping **Ask Pip** while Pip is talking stops the speech and starts recording.

## Where the code is

| File | Job |
| --- | --- |
| `voice/app.py` | `POST /api/voice` (question in, answer out) and `POST /api/speak` (text in, speech out, cached): calls Omni, returns text plus WAV audio |
| `frontend/src/lib/voice-api.ts` | The HTTP calls from the browser (`askVoice`, `speakText`); reads `NEXT_PUBLIC_VOICE_API_URL` |
| `frontend/src/hooks/useVoiceAssistant.ts` | Mic recording, sending, playback, `speak()`, the four states above, the browser-voice fallback |
| `frontend/src/components/CookingView.tsx` | Uses the hook for the "Ask Pip" button, Pip's mood, and reading steps aloud |
| `frontend/.env.local` | `NEXT_PUBLIC_VOICE_API_URL=http://localhost:8000` (git-ignored; restart `npm run dev` after changing) |

## Testing

- **Service:** the `curl` command in `voice/README.md`.
- **Whole flow, no microphone needed:** we verified it with a real Chrome fed `voice/samples/voice_test.wav` as a fake microphone. Checked: steps are spoken with Omni audio (and not the browser voice), the button returns to idle when audio ends, "Repeat aloud" is served from the cache, "Next step" reads the next step, "Ask Pip" interrupts speech and records, the question is answered and spoken, and with the voice service blocked the browser voice reads the step.

## Known limits and next steps

- The question is not transcribed, so the UI shows only Pip's answer, not "You asked…". Omni could return the transcript if we want it.
- **Step 1 still starts after a delay** of roughly the length of its speech (3 to 7s), because Omni generates audio at about real-time speed. The step text is on screen meanwhile. Every later step is prefetched (see above), so it starts in about 0.2s. To shorten step 1 too, stream the audio and start playing at the first chunk (about 1.7 to 2.8s); that is a bigger change. See [omni-voice.md](omni-voice.md).
- A full answer to a question takes about 4s for the same reason. Questions can't be prefetched.
- Recording is tap-to-start, tap-to-stop. Automatic end-of-speech detection and hands-free "next" and "done" commands are not built yet.
- `answerCookingQuestion` in `frontend/src/lib/mocks.ts` and `frontend/src/types/speech.d.ts` are now unused; they can be deleted once the team agrees. Everything that changed in the frontend, including the lint fixes, is listed in [frontend-changes.md](frontend-changes.md).
