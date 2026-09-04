# Fleet console — improvements

Local USB bench. History is keyed by ESP32 factory MAC. SQLite on this machine is not yet the production ledger.

## 1. [done] Flash a known binary — compile cache

Compile once per `(sku, git SHA, FQBN)` (or sketch content hash for working tree). Later flashes of the same artifact skip Arduino compile and upload the cached binaries.

**Where the cache lives:** on the USB bench disk, next to SQLite, **not** in browser localStorage.

- Path: `server/data/firmware-cache/` (already gitignored with `server/data/`)
- Why not localStorage: these are multi‑MB `.bin` sets; compile happens in Node on the machine with `arduino-cli`; the browser never holds the artifact
- Key: SHA-256 of `{ sku, sha, contentHash, fqbn }` → folder `server/data/firmware-cache/<sku>/<id>/out/`
- First compile still ~minutes; repeats of the same SKU+commit should be upload + serial only

## 2. [done] Serial as acceptance test

After upload, grade the 15s boot capture against `setup()` pin checks in the SKU sketches (`server/accept.js`). Score is N/10. Required misses (wrong banner, RC522 missing, brownout, no boot log) are **fail** and do not count as a good write. Optional misses (fuel gauge) are **warn**.

LLM is optional: set `SOS_LLM_KEY` or `OPENAI_API_KEY` to add a short interpretation. The score itself is always deterministic.

## 3. [todo] Provision kit identity over USB

**Yes: slot is assigned in the console** (`01` → display name `my-hro-kiosk-01`). That is already a Settings field.

What it does **today:** PATCH `/api/kiosks/:mac` writes `slot` / `name` on the `kiosks` row. The ESP32 never sees it. After a flash the chip still comes up as an unconfigured kit and learns hostname / Wi-Fi / secrets only through the captive portal → NVS.

What this item is: after a **passing** USB flash, the bench should push the console slot onto the chip over serial (same port, no extra image):

- hostname `my-hro-kiosk-nn` (from slot)
- optional bench Wi-Fi so it can join without standing at the portal
- leave the portal in firmware for field reconfig

Still **one binary per SKU**. Do not bake slot into the sketch. Console is source of truth for which physical kit this MAC is; USB is how that identity gets into NVS.

## 4. [done] Kiosk ledger is Postgres

`kiosks` is the primary table (ESP32 factory MAC unique). `flashes` belong to a kiosk. Local Docker Postgres is the bench ledger; SQLite is only imported once if `server/data/fleet.sqlite` still exists.

## 5. [todo] Pin the job to a chip, not a COM port

After Identify, lock MAC + that port. Abort if MAC or USB identity changes before upload. Skip if that MAC already has a passing write of the selected SHA. Allow cancel. Do not hold the port across compile — compile the artifact, then take the port for upload + serial grade.
