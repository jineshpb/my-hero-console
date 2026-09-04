# SOS fleet console (USB only)

Flashes SKUs from a **separate firmware git**. Point the UI at that URL (or a local clone) and **Save & pull**.

```bash
npm install
npm run db:up
npm run dev
```

- UI: http://127.0.0.1:5174
- API: http://127.0.0.1:3848
- Postgres: `postgres://myhero:myhero@127.0.0.1:5432/myhero` (`DATABASE_URL` to override)

Kit heartbeat, SOS, and door POSTs: [API.md](API.md).

## Trial (Docker)

One compose file: Postgres + a single `app` container that serves the UI and `/api`. Identify/Flash still belong on the USB bench.

```bash
docker compose up --build
```

- Console: http://127.0.0.1:8080
- Heartbeat: `POST http://127.0.0.1:8080/api/v1/sos/status`
- SOS: `POST http://127.0.0.1:8080/api/v1/sos/trigger`
- Door: `POST http://127.0.0.1:8080/api/v1/sos/door`

`npm run db:up` still starts only Postgres for local `npm run dev`. Change the published trial port with `TRIAL_PORT=3000`.
