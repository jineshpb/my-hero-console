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

## Dokploy

Use an **Application** (Dockerfile), not Compose. Domains stay in the Domains tab.

- GitHub `jineshpb/my-hero-console`, branch `main`
- Build type: Dockerfile, file `Dockerfile`
- Container port **3848**
- Env: `DATABASE_URL` = the Postgres service **Internal** URL (port **5432**, not 5433)
- Domain: `myhero.jineshb.app` (or whatever you set), port 3848

Applications join `dokploy-network` on their own, so Traefik uses the file provider like Hello World. Remove or stop the Compose `kiosk` service after this is up, or the domain will clash.

## Local Docker

Same image as Dokploy. Postgres stays on Dokploy.

```bash
docker compose up --build
```

- Console: http://127.0.0.1:3848
- Heartbeat: `POST http://127.0.0.1:3848/api/v1/sos/status`
- SOS: `POST http://127.0.0.1:3848/api/v1/sos/trigger`
- Door: `POST http://127.0.0.1:3848/api/v1/sos/door`
