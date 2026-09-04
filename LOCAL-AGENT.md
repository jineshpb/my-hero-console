# Local agent handover — USB fleet console

Run this on the **machine the ESP32 is plugged into**. Do not run Identify/Flash on the VPS.

## Git

Firmware is a **separate git** (not this console repo). Set the URL in the UI and **Save & pull**. Versions are commits of that firmware repo only.

Local default on this machine: sibling folder `my-hero-firmware` (same parent as this console). Override in the UI if needed.

## Why not the VPS

The Node API calls `arduino-cli board list` and `esptool --port … read_mac` on **localhost**. An SSH tunnel only forwards TCP (`:5174`, `:3848`). It does not forward `COM5` / `/dev/ttyUSB0`.

If Node runs on the VPS and the board is in a laptop USB port, ports will be empty.

## What this console is

USB-only bench UI: pick a SKU, identify the chip, flash with Arduino CLI, keep write history.

Identity is the **ESP32 factory Wi-Fi MAC** (`esptool read_mac`), not the USB-UART serial. CH340 clones often share one USB serial number.

History lives in **Postgres** (`kiosks` + `flashes`) on the existing Dokploy database. Set `DATABASE_URL` in `.env`.

On first boot, existing `server/data/fleet.sqlite` is imported into Postgres and left in place as a backup.

Kit slot is assigned in the console first (`New kiosk`). Identify/Flash on that kiosk binds the factory MAC. After a passing flash the bench writes `MHCFG hostname=my-hro-kiosk-nn` over USB (optional `BENCH_WIFI_SSID` / `BENCH_WIFI_PASSWORD`). Firmware should persist that to NVS and print `MHCFG OK`. Portal stays for field reconfig.

## SKUs

| id | Sketch | Hardware |
|---|---|---|
| `combined` | `skus/combined/combined.ino` | SOS button + RFID + servo |
| `sos` | `skus/sos/sos.ino` | SOS button + servo, no RFID |
| `rfid` | `skus/rfid/rfid.ino` | RFID + servo, no SOS button |

Flash FQBN: `esp32:esp32:esp32:PartitionScheme=huge_app` (override with `SOS_FQBN`).

## Prerequisites on the USB machine

- Node.js (npm)
- `arduino-cli` on PATH, ESP32 core installed (this repo was built against core **2.0.17**)
- esptool at `~/.arduino15/packages/esp32/tools/esptool_py/4.5.1/esptool.py` (Linux/mac). Override with `ESPTOOL=/path/to/esptool.py` if different. Windows Arduino data dir is under `%LOCALAPPDATA%\Arduino15\…`
- Board USB cable; if Identify fails: hold BOOT, tap EN, retry (classic `No serial data received`)

## Run

```bash
cd my-hero-console
npm install
npm run dev
```

- UI: http://127.0.0.1:5174
- API: http://127.0.0.1:3848

## Flow for the local agent

1. **New kiosk** — assign slot `01`–`nn` in the UI. No USB yet.
2. Plug the ESP32 in. **Refresh** until the port appears (`COM*` or `/dev/ttyUSB*` / `ttyACM*`).
3. Open that kiosk → **Bind USB** / **Identify** — reads MAC onto this kiosk row.
4. Pick SKU and a **firmware version** (git commit + message). **Pull from GitHub** fetches the firmware remote. **Flash** compiles that commit’s sketch in a temp dir (`git show`, no checkout) → `arduino-cli upload`. A passing accept test then sends `MHCFG` identity over serial.
4. Do not promise OTA. USB only. No remote deploy from the VPS.

## If you change firmware

Commit in `my-hero-firmware`. The console records that repo’s SHA at flash time. Flash from a clean commit when you care about the SHA.

## Do not

- Flash from Cursor/SSH on the VPS while the board is local.
- Key history on USB serial.
- Bake slot into the binary; one image per SKU, identity via portal.
