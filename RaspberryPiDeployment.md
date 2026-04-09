# Raspberry Pi Deployment

This document describes the minimal production deployment for this repository on the Raspberry Pi environment currently prepared for `gra.tetowaniemaliny.pl`.

## Source Of Truth

The deployment details below are derived from the current repo layout and code:

- Frontend: Angular SPA built from the repo root.
- Backend: separate Node + Express server started from `server/src/index.ts`.
- Backend API base: `/api/*`.
- Frontend routes are client-side Angular routes and require SPA fallback in nginx.
- Backend persists auth/session data in `server/data/auth.json`.
- Backend persists save files in `server/data/saves/`.
- Active game state still lives partly in backend memory. Restarting the backend can lose the active in-memory game unless it was saved and reloaded manually.

## Actual Runtime Architecture

The backend does not serve the frontend bundle. nginx must serve the built Angular app as static files and proxy `/api/` to the backend on localhost.

The backend currently does not have a dedicated compiled-JavaScript production build path. `server/package.json` defines:

- `npm run dev` -> `tsx watch src/index.ts`
- `npm run start` -> `tsx src/index.ts`

That means the current minimal production runtime still depends on `tsx` inside `server/node_modules`.

## Expected Paths

The real deployment checkout path on this machine is:

- `/srv/srogame`

Earlier notes that used `/srv/srogame/app` were incorrect for this machine and should be treated as obsolete.

Everything below assumes the deployed repo is at:

- `/srv/srogame`

## Required Code Setting

The frontend API base must remain relative so browser clients call the same public origin through nginx:

```ts
export const API_BASE_URL = '/api';
```

## Verified Deployment Notes

- Frontend source root: repo root `/srv/srogame`
- Backend source root: `/srv/srogame/server`
- Frontend build command: `npm run build` from `/srv/srogame`
- Verified frontend build output:
  - `/srv/srogame/dist/srogame`
  - static nginx root: `/srv/srogame/dist/srogame/browser`
- Backend runtime command: `npm run start` from `/srv/srogame/server`
- Backend health endpoint already exists at `GET /api/health`
- Backend writable paths are relative to the server runtime and resolve to:
  - `/srv/srogame/server/data/auth.json`
  - `/srv/srogame/server/data/saves/`
- The backend previously hardcoded `cors({ origin: 'http://localhost:4200' })`; this has been corrected so CORS is only enabled when `FRONTEND_ORIGIN` is explicitly set. That fits nginx same-origin deployment and still allows optional cross-origin dev usage when needed.
- The frontend now also includes `proxy.conf.json`, and the Angular `serve` target uses it by default so the relative `/api` base still works during local Angular development against a backend on `localhost:3000`.

## Checked-In Deployment Templates

The repo now includes concrete deployment templates under:

- `deploy/systemd/srogame-backend.service`
- `deploy/nginx/srogame.conf`
- `deploy/README.md`
