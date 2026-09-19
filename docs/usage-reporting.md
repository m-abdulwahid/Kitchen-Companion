# Usage reporting: how much Omni have we used, and what to send

The organisers ask each team to keep a ledger of API calls and submit a summary. This page is how we do that. Their guide: [yibuapi-usage-reporting.md](https://github.com/7nr754rpby-cmyk/OMNI-Live-Build-the-Next-Generation-of-Real-Time-Multimodal-AI/blob/6244ce145d2689544c0929a371adff47f0916383/docs/yibuapi-usage-reporting.md).

**Deadline: Sunday 2026-09-20, 11:59 PM Eastern (Toronto time).** Reply to the email that delivered the API key, attach the two files below, and include the details in "What to write in the email". One application per team.

## How much have we used?

```
python scripts/usage_report.py --extra "C:\Users\Nafis\Github\hackathon\artifacts\yibu_api_calls.jsonl"
```

Run it from the repo root (any Python 3, nothing to install). It prints totals by purpose, model and day, and writes the files to send. Nothing is sent anywhere. Drop `--extra` if the old `hackathon` folder is gone.

Snapshot from 2026-09-19 12:50 (Eastern):

| | Calls | Tokens (total) |
| --- | --- | --- |
| **Everything** | **174** (170 ok, 4 failed) | **26,538** (14,808 in, 11,730 out) |
| Steps, previews, translation, prefetch (`voice_text_to_speech`) | 60 | 10,929 |
| Ask a question (`voice_audio_understanding`) | 32 | 6,770 |
| Checking all 56 voices (`voice_verify`) | 63 | 6,747 |
| Comparing voices and models (`voice_compare`) | 6 | 1,112 |
| Early voice experiments (`tts_probe`) | 13 | 980 |

One key is in use (`...BBOf`). The guide states **no limit**, so compare the total with the allocation in your approval email. The numbers grow with every step read or question asked; re-run the command for current figures.

## The usage page (password protected)

With the voice service running, open **http://localhost:8000/usage** and enter the password (`USAGE_PAGE_PASSWORD` in the root `.env`, currently set to `password`). It shows everything on this page, live:

- Total tokens, calls, failed calls and the last call, with a countdown to the deadline.
- **How much is left:** type your allocation (tokens) from the approval email and it shows used, left and a progress bar. It is saved in your browser only. The organisers' tools do not report remaining credit, and the guide states no limit.
- Usage by purpose, model and day, and the latest 30 calls.
- **Send to the organisers:** a **Generate files** button (runs the organisers' own `summarize_usage.py`; tick "remove my folder path" to drop your local path from the summary), and **Download** buttons for the two files to attach.
- The privacy checks, the usage we know is missing, which ledgers were merged, and a **draft email** to copy. Fill in what is in [square brackets] (team name, repository link, application email); we cannot know those.

It reads the same ledgers as the command line (`voice/usage.py` is shared by both), and the old `hackathon` folder's ledger is included automatically through `USAGE_EXTRA_LEDGERS` in `.env`, so `--extra` is no longer needed. It refreshes every 15 seconds.

**How the password works.** The page at `/usage` is an empty shell with no data. The numbers only come back from the server after a login, so hiding a box in the page is not the protection. Wrong passwords are counted per address: 5 wrong tries lock that address out for 60 seconds. A login lasts 8 hours or until you press **Lock**, and it is forgotten when the voice service restarts. Only the two report files can be downloaded (not the ledger, `.env` or any other file). No response ever contains the API key, prompts or audio (tested). If `USAGE_PAGE_PASSWORD` is empty the page is off.

**Be honest about how strong this is.** `password` is a password anyone would guess first. It keeps a casual look over your shoulder out, but the voice service listens on all network interfaces (`--host 0.0.0.0`), so **anyone on the same Wi-Fi can reach this page** and try it. What they would get is your token counts, not your key. Before demoing on venue Wi-Fi, either change the password in `.env` and restart the voice service, or start the service with `--host 127.0.0.1` so only your own computer can open it (then a phone on the same network can no longer reach the voice service either).

## Accounting checks for streaming calls

The organisers warn that their examples use non-streaming calls, and that streamed, interrupted or retried calls are not automatically counted correctly. Our service streams, so we checked (2026-09-19):

- **Usage is reported once per stream.** In a 12-chunk stream exactly one chunk (the last) carried a usage count. The service records that one, so nothing is double-counted or under-counted.
- **Interrupted requests are still recorded.** When the browser gave up on a request after 0.6 seconds (as happens when you press Next quickly or interrupt Pip), the service still finished the Omni call and logged it. Abandoned requests do not create unrecorded usage.
- **No retries:** the service never retries a call, and a step already read comes from the cache without calling Omni again, so there is no repeated usage to count twice.
- **Streaming is not multi-turn:** each call is a single request and response, so the "cumulative usage" warning for long WebSocket sessions does not apply.

## How calls get recorded

- The voice service (`voice/app.py`) writes one line to `artifacts/yibu_api_calls.jsonl` for every Omni call, using the organisers' `append_audit_record` from `voice/yibu_audit.py`. This is the "custom application" route in their guide (step 6B). Failed calls are recorded too.
- Each line holds: call id, timestamps, model, the **last 4 characters** of the key, a short purpose label, endpoint, success or failure, latency and token usage. It holds **no prompts, audio or full keys**. (We checked the ledger for the full key: not present.)
- Purpose labels are short and contain no personal data: `voice_audio_understanding` (asking a question), `voice_text_to_speech` (reading steps, previews, translation, prefetch), `voice_verify`, `voice_compare`, `tts_probe` (our own tests).
- Anything new that calls Omni must log the same way. If it uses several threads, lock around the write: the audit writer is not thread-safe on Windows (see below).

## What to attach

`python scripts/usage_report.py ...` writes these to `artifacts/summary/` using the organisers' own `summarize_usage.py`:

- `usage_summary.json`
- `usage_by_model_key_purpose.csv`

The merged ledger it builds from is `artifacts/summary/ledger_merged.jsonl`. **Do not send the ledger**; keep it private for reconciliation.

## What to write in the email

Include (from the guide): team name, project/repository link, the email address used for the API application, the reporting period, and the key suffix `...BBOf`. Then describe missing usage honestly. As of 2026-09-19:

- **Reporting period:** first recorded call 2026-09-19 01:36 Eastern, to the time you generate the summary. Earlier calls were not recorded (next point).
- **Calls made before logging existed:** two probe calls from `scripts/discover.py` around 00:58 Eastern on 2026-09-19 (a text call and an audio call) were not logged. Their reported usage was 23 and 69 tokens (92 total). It also listed the models (no tokens).
- **One lost record:** our run testing all 56 voices made 64 calls but logged 63. The audit writer overwrote one record when several threads wrote at once (about 100 tokens, the average for that run). Fixed in `scripts/verify_voices.py` with a lock. We did not invent a replacement record.
- **Failed calls have no token usage** (4 of 174). They count as unknown, not zero: an empty audio clip, two voice names the model rejected (`Cherry`, `Chelsie`), and `qwen3.8-omni-flash`, which cannot produce audio.
- **Additional ledger merged:** the old `hackathon` folder had one record (07:10 Eastern, 132 tokens) from the earlier voice server that was not in the main ledger. `usage_report.py --extra` merges it, dropping duplicates.
- **Teammates:** if anyone else called Omni with this key from their own machine, their ledger is not in ours. Ask them to send theirs (privately) and add it with another `--extra`.

## Privacy checks before sending

Checked 2026-09-19 on the generated files:

- No full API key, `.env` content or `Bearer` token in either file. Only `...BBOf`.
- No prompts or audio: the ledger has none, and the summary only has counts.
- **`usage_summary.json` contains a full local path** (`source.path`, e.g. `C:\Users\<you>\...`). The organisers' tool always writes it. If you would rather not share your folder path, run the report with `--redact-paths`; counts and the file hash are unchanged. It is off by default so their output stays as they produce it. The CSV has no paths.
- Error text in the ledger is harmless so far (short messages like "Voice 'Cherry' is not supported"), and it is not copied into the summary. Re-read the summary before each submission anyway.
- Do not post these files publicly. The GitHub repo is private today, `artifacts/summary/` is git-ignored, and the ledger itself is in git; check who has repo access, or ask us to stop tracking it.

## Checklist for the final submission

1. Stop or finish making calls, or accept that later calls are not in the report.
2. `python scripts/usage_report.py --extra "<old ledger>" [--redact-paths]`
3. Open `usage_summary.json` and confirm the totals match what was printed.
4. Reply to the API key email with the two files and the details above.
