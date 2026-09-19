# Kitchen-Companion
Kitchen Companion turns whatever's in your fridge into a live, voice-guided recipe, with an AI that watches you cook and answers questions in real time.

## Folder layout

```
Kitchen-Companion/
├── frontend/     Next.js app: recipes, cookbook, live cooking view
├── voice/        Voice service (FastAPI): audio in, spoken-style answer out
│   ├── app.py, yibu_audit.py, requirements.txt
│   ├── test-page/    standalone push-to-talk page for testing
│   └── samples/      test audio
├── backend/      Backend service (TBD)
├── vision/       Camera "check my step" service (TBD)
├── docs/         Notes and write-ups
├── scripts/      One-off helper scripts
├── examples/     Vendor API examples (read-only reference)
├── artifacts/    API call audit log (written by the services)
├── .env.example  Template for the shared config
└── .env          Your real keys (git-ignored, never commit)
```

## Where things go

- Work only inside your own folder: `frontend/`, `voice/`, `backend/` or `vision/`.
- Each service keeps its own dependencies: `requirements.txt` for Python, `package.json` for the frontend. Use a `.venv` inside your folder.
- Config and keys go in the root `.env` (copy `.env.example`). Add any new variable to `.env.example` too, with no value.
- The frontend reads its own `frontend/.env.local` (Next.js only reads env from its own folder), e.g. service URLs like `NEXT_PUBLIC_VOICE_API_URL`.
- Services talk over HTTP; the frontend calls them, they don't import each other's code.
- Ports: frontend 3000, voice 8000, backend 8001, vision 8002.
- Notes and docs go in `docs/`. Test audio, images and other sample data go in your folder's `samples/`.

## Running

| Part | Command |
| --- | --- |
| Frontend | `cd frontend && npm install && npm run dev` |
| Voice | see [voice/README.md](voice/README.md) |

## Merging without breaking things

- Pull before you start work and again before you push: `git pull`.
- One branch per person or feature (e.g. `voice/push-to-talk`), then merge to `main`. Don't push straight to `main`.
- Commit small and often, and stay in your own folder so merges don't collide.
- Need to change a shared file (`README.md`, `.env.example`, `frontend/src/lib/types.ts`)? Tell the team first.
- Don't rename, move or reformat files you don't own.
- Never hand-edit `package-lock.json` to fix a conflict: take either version, then run `npm install`.
- Never commit `.env`, `.venv/` or `node_modules/`.
- Run your part before merging, and after merging run the frontend and your service once to check nothing broke.
