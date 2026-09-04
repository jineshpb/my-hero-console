# Kit webhook API

Field kits POST JSON to this console. The chip must be able to reach the host — `127.0.0.1:3848` is this laptop only.

| Event | Method | Endpoint | Console field |
|---|---|---|---|
| Heartbeat / status ping | `POST` | `/api/v1/sos/status` | Status API URL |
| SOS press | `POST` | `/api/v1/sos/trigger` | SOS API URL |
| Door open | `POST` | `/api/v1/sos/door` | *(no portal field yet; same host as SOS)* |

Aliases without `/v1` work: `/api/sos/status`, `/api/sos/trigger`, `/api/sos/door`.

Local bench and Docker: `http://127.0.0.1:3848`. Example full URLs:

```
http://127.0.0.1:3848/api/v1/sos/status
http://127.0.0.1:3848/api/v1/sos/trigger
http://127.0.0.1:3848/api/v1/sos/door
```

`GET /api/v1/sos` returns this contract as JSON. `hash` is auth only and is never stored.

Content-Type should be `application/json`. The server also accepts a JSON body when the ESP32 omits Content-Type.

---

## Heartbeat

`POST /api/v1/sos/status`

About every 10 minutes. Look up the kiosk by `kitId`. `hash` must equal the **stored status hash** on that kiosk row (not computed per ping).

### Body

| Field | Required | Notes |
|---|---|---|
| `kitId` | yes | Must match a kiosk `kit_id` |
| `localTimeStamp` | yes | Kit local time string |
| `hash` | yes | Stored status hash |
| `deviceId` | when `statusext=1` | |
| `batteryPercent` | when `statusext=1` | Number, e.g. `86.2` |
| `batteryVoltage` | when `statusext=1` | Number, e.g. `3.901` |
| `wifiRssi` | when `statusext=1` | Integer dBm, e.g. `-58` |
| `uptimeSec` | when `statusext=1` | Integer seconds |
| `bootCount` | when `statusext=1` | Integer |
| `resetReason` | when `statusext=1` | String |
| `rfidOk` | when `statusext=1` | Boolean |

Original three-field ping:

```json
{
  "kitId": "bench-flyout-04",
  "localTimeStamp": "2026-09-04T16:01:00",
  "hash": "<status hash from the kiosk row>"
}
```

Extended ping (`statusext=1`):

```json
{
  "kitId": "bench-flyout-04",
  "localTimeStamp": "2026-09-04T16:01:00",
  "hash": "<status hash from the kiosk row>",
  "deviceId": "esp32-sos-04",
  "batteryPercent": 86.2,
  "batteryVoltage": 3.901,
  "wifiRssi": -58,
  "uptimeSec": 600,
  "bootCount": 4,
  "resetReason": "power-on",
  "rfidOk": true
}
```

---

## SOS press

`POST /api/v1/sos/trigger`

Needs a `kit_secret` on the kiosk. Firmware hashes the literal string `"unknown"` in the middle, even if `triggeredBy` is something else.

```
hash = sha256(kitId + "-" + "unknown" + "-" + localTimeStamp + "-" + attemptNo + "-" + kitSecret)
```

### Body

| Field | Required | Notes |
|---|---|---|
| `kitId` | yes | |
| `triggeredBy` | no | Defaults to `unknown` |
| `localTimeStamp` | yes | |
| `attemptNo` | yes | Integer `>= 1` |
| `hash` | yes | See formula above |

```json
{
  "kitId": "bench-flyout-04",
  "triggeredBy": "unknown",
  "localTimeStamp": "2026-09-04T16:05:00",
  "attemptNo": 1,
  "hash": "<sha256 hex>"
}
```

Same `(kiosk, localTimeStamp, attemptNo)` is idempotent — a repeat POST returns the existing row.

---

## Door open

`POST /api/v1/sos/door`

Needs a `kit_secret`. Firmware does not POST this yet; the table and route are ready.

```
hash = sha256(kitId + "-" + triggeredBy + "-" + localTimeStamp + "-" + attemptNo + "-" + kitSecret)
```

Use the real `triggeredBy` value in the hash (`RFID` or `SOS button` from `unlockDoor`).

### Body

| Field | Required | Notes |
|---|---|---|
| `kitId` | yes | |
| `triggeredBy` | no | Defaults to `unknown`; include the real reason in the hash |
| `gpio` | no | Servo pin, typically `33` |
| `localTimeStamp` | yes | |
| `attemptNo` | yes | Integer `>= 1` |
| `hash` | yes | See formula above |

```json
{
  "kitId": "bench-flyout-04",
  "triggeredBy": "RFID",
  "gpio": 33,
  "localTimeStamp": "2026-09-04T16:06:00",
  "attemptNo": 1,
  "hash": "<sha256 hex>"
}
```

Same unique key as SOS: `(kiosk, localTimeStamp, attemptNo)`.

---

## Success

All three return `200`:

```json
{
  "ok": true,
  "id": 12,
  "receivedAt": "2026-09-04T10:31:00.000Z"
}
```

`id` is the new (or existing idempotent) row. `receivedAt` is server time.

---

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing field, invalid JSON, or `attemptNo` not an integer `>= 1` |
| `401` | Hash does not match |
| `404` | Unknown `kitId` |
| `409` | Heartbeat: kiosk has no status hash. SOS/door: kiosk has no kit secret |

```json
{ "error": "Unknown kitId" }
```

---

## curl

```bash
# Heartbeat
curl -X POST http://127.0.0.1:3848/api/v1/sos/status \
  -H "Content-Type: application/json" \
  -d '{"kitId":"bench-flyout-04","localTimeStamp":"2026-09-04T16:01:00","hash":"..."}'

# SOS
curl -X POST http://127.0.0.1:3848/api/v1/sos/trigger \
  -H "Content-Type: application/json" \
  -d '{"kitId":"bench-flyout-04","triggeredBy":"unknown","localTimeStamp":"2026-09-04T16:05:00","attemptNo":1,"hash":"..."}'

# Door
curl -X POST http://127.0.0.1:3848/api/v1/sos/door \
  -H "Content-Type: application/json" \
  -d '{"kitId":"bench-flyout-04","triggeredBy":"RFID","gpio":33,"localTimeStamp":"2026-09-04T16:06:00","attemptNo":1,"hash":"..."}'
```
