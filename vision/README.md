# vision

Reserved for the vision service, i.e. the "check my step" camera check (owner: TBD). The frontend currently mocks this in `frontend/src/lib/mocks.ts`. Keep dependencies in its own file here and read config from the root `.env`.

Update: the check itself lives in the voice service for now (`POST /api/vision/check`, prompt in `voice/vision.py`, live test page at `/vision`), because it reuses that service's Omni key, audit log and CORS setup. See [../voice/README.md](../voice/README.md#api).
