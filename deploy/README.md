# Deployment Files

These are the checked-in production templates for the Raspberry Pi deployment at `/srv/srogame`.

- `systemd/srogame-backend.service`: backend service running as `srogame:srogame`
- `nginx/srogame.conf`: nginx site serving the built Angular SPA and proxying `/api/` to the backend

Important:

- The repository checkout path is `/srv/srogame`, not `/srv/srogame/app`.
- The verified Angular production static root is `/srv/srogame/dist/srogame/browser`.
- The backend listens on port `3000` by default and exposes `GET /api/health`.
- Writable runtime data lives under `server/data/`, especially `server/data/auth.json` and `server/data/saves/`.
- Local Angular development now uses `proxy.conf.json` so the relative `/api` base still works with `npm run start`.
