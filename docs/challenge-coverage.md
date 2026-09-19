# Challenge coverage

Kitchen Companion should only enter sponsor challenges it can demonstrate
honestly in the working product.

| Challenge | Status | Evidence to show |
| --- | --- | --- |
| Huawei OMNI Live | Strong fit | One uninterrupted cook flow: camera sees the pan, Omni reasons over the recipe and image, Remy speaks a response, and the cook can interrupt naturally. The app uses vision, audio/speech, language, and Realtime streaming together. |
| Backboard | Strong fit after key setup | Save an explicit cooking preference, then show that a later relevant camera-agent turn receives that preference through an isolated Backboard memory. See [backboard-memory.md](backboard-memory.md). |
| Sentry | Strong fit after DSN setup | Show the `camera-agent turn` trace, Omni/Backboard backend spans, a privacy-masked Session Replay, and the error/recovery path described in [sentry-observability.md](sentry-observability.md). |
| OpenAI API + Codex | Partial | Codex materially helped plan, implement, test, and debug this repository. Do not submit this track unless the project also adds a real OpenAI API feature; Codex use alone does not satisfy the stated OpenAI API requirement. |
| Shopify | Not yet a fit | A credible future feature is an ingredient-restock handoff or merchant recipe-to-cart workflow, but it needs a real Shopify store/API integration and should not be mocked for the prize. |
| Baseten / Browserbase | Not yet a fit | The challenge text appears to mention both platforms. A real fit would be reliable browser-based recipe-video ingestion or a separately hosted inference workflow; neither is integrated today. |

## Recommended submission focus

Submit Huawei, Backboard, and Sentry only after their two optional keys are
configured and the live demo has been rehearsed. This keeps the story focused:
an attentive, privacy-conscious kitchen companion that sees a cooking state,
hears the cook, remembers an explicit preference, and can be debugged from the
same end-to-end interaction trace.
