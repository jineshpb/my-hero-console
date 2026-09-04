# SOS fleet console (USB only)

Flashes SKUs from a **separate firmware git**. Point the UI at that URL (or a local clone) and **Save & pull**.

```bash
npm install
npm run dev
```

Set `DATABASE_URL` in `.env` to the existing Dokploy Postgres. Do not start a second database.

- UI: http://127.0.0.1:5174
- API: http://127.0.0.1:3848

Kit heartbeat, SOS, and door POSTs: [API.md](API.md).

## Trial (Docker)

One `app` container that serves the UI and `/api`. Postgres is already on Dokploy. Identify/Flash still belong on the USB bench.

```bash
docker compose up --build
```

- Console: http://127.0.0.1:3848
- Heartbeat: `POST http://127.0.0.1:3848/api/v1/sos/status`
- SOS: `POST http://127.0.0.1:3848/api/v1/sos/trigger`
- Door: `POST http://127.0.0.1:3848/api/v1/sos/door`
