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

Slot is notes in SQLite; the chip still learns identity via captive portal / NVS. After a passing flash, write slot / hostname / optional WiFi from the bench. Portal stays for field reconfig.

## 4. [todo] Production is the ledger; SQLite is a local queue

Push identify / flash / verdict (MAC, SKU, SHA, slot, serial grade, logs, station, operator) to the production API as it happens. Retry from sqlite if the network is down. MAC remains the key.

## 5. [todo] Pin the job to a chip, not a COM port

After Identify, lock MAC + that port. Abort if MAC or USB identity changes before upload. Skip if that MAC already has a passing write of the selected SHA. Allow cancel. Do not hold the port across compile — compile the artifact, then take the port for upload + serial grade.
