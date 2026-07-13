# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ELRSense adds custom sensor telemetry (RPM, GPS, current/voltage, barometer, temperature, plain voltage) to ExpressLRS receivers by injecting CRSF frames from an ESP32-C3. There is no build system, package manager, or test suite in this repo — it's a static client-side web app (the "configurator") plus a tree of Arduino/C++ source fragments it assembles.

## Repository layout

- `firmware/` — CRSF frame encoding (`common/`), the one supported board's pin map/UART setup (`boards/esp32c3_zero/`), and one driver per sensor (`sensors/<name>/`). **Not a standalone buildable project.** Files use unqualified includes like `#include "board.h"` that only resolve once `configurator/generator.js` inlines the selected pieces into one file. Don't try to compile this tree directly.
- `configurator/` — static, dependency-free web app (`catalog.js` + `generator.js` + `app.js` + `index.html`) that lets a user pick sensors, map each to a pin, and download a single self-contained `.ino`. See `configurator/README.md`.
- `reference/pro-mini-crsf-temp/` — a known-working Arduino Pro Mini reference implementation, kept unmodified. `crsf.md` there is the CRSF protocol spec and is the source of truth for every frame layout used in `firmware/common/crsf.h`.
- `recources/esp32-c3-zero-pinout.jpg` — pinout diagram, shown inline in the configurator UI (note the folder name typo — matches what's actually referenced in code).

## Running / testing locally

There is no build, lint, or test command. To run the configurator:

```
npx serve .
```

from the repo root, then open `http://localhost:<port>/configurator/`. It **must** be served over http(s) — `generator.js` uses `fetch()` to pull real files from `../firmware/` at generation time (so the configurator can never drift from what's actually in `firmware/`), and `fetch()` of local files is blocked by CORS under `file://`.

There's no automated test suite. The pattern used during development for verifying generator/UI changes: drive `generateArduinoSingleFile()` (or the DOM) directly from a throwaway HTML harness loaded via headless Chrome (`chrome --headless --disable-gpu --no-sandbox --dump-dom`), inspect the generated `.ino` text or DOM state, then delete the harness file. There is no way to actually compile the generated `.ino` in this environment (no arduino-cli/avr-gcc) — that check has to happen on a real machine with Arduino IDE.

## Architecture: how a `.ino` gets assembled

This is the part that needs multiple files to understand:

1. **`catalog.js`** is the single source of truth for board + sensor metadata — pin pools, which `#define` macros are user-tunable (`configDefines`), which sensors get a per-instance pin picker (`pinRole`), CRSF `source_id` bases, and `instanceSymbols` lists. Adding a sensor means adding one entry here plus its `firmware/sensors/<name>/` files; `app.js` and `generator.js` are never supposed to need touching.
2. **`generator.js`** fetches the real `.h`/`.cpp` text from `firmware/` over HTTP, then for each selected sensor:
   - strips `#pragma once`, local `#include "..."`, and all comments (`stripComments`/`stripDirectives`/`finalizeBody`) — the output is meant to be minimal, not a copy of the annotated source;
   - hoists system `#include <...>` lines to the top, deduplicated;
   - renames file-scope `static` symbols by prefixing them with a per-module id (`prefixStatics`) so multiple sensor `.cpp` files sharing an identifier (e.g. `last_poll_ms`) don't collide once concatenated into one translation unit;
   - for sensors with a `pinRole` (multi-instance capable — `hall_3144e`, `mf58_ntc`, `voltage_divider`, `gps_m100_5883`), additionally renames every name in `instanceSymbols` (public functions, the pin macro, the source_id macro if any, calibration constants) with a per-instance suffix (`renameSymbols`), so N copies of the same sensor can coexist;
   - extracts each sensor's `configDefines` (and, for pin-role sensors, a synthesized pin/source_id `#define`) into one `USER CONFIGURATION` block at the top of the output, preserving any explanatory comment that sat directly above the original `#define` (`extractConfigDefine`).
3. Everything is concatenated: header comment → hoisted includes → `USER CONFIGURATION` block → all headers → all implementations → `setup()`/`loop()` (filled in from `firmware/templates/main.cpp.template`) → downloaded as one `.ino`.
4. **`app.js`** renders the UI purely off `catalog.js` (one `+ Add` control per sensor type, capped by `maxInstances`; a pin `<select>` if `pinRole` is set) and calls `generateAndDownload()`.

### Why some sensors are capped at one instance

CRSF frame types 0x02 (GPS), 0x08 (Battery/INA226), and 0x09 (Baro/BMP280) have no `source_id` field in the protocol — a second instance would be indistinguishable to the receiver, so `catalog.js` sets `maxInstances: 1` and omits `pinRole`/`sourceIdDefine` accordingly. Frame types 0x0C (RPM), 0x0D (TEMP), and 0x0E (Voltages) do carry a `source_id`, so `hall_3144e`, `mf58_ntc`, and `voltage_divider` are uncapped. Check `reference/pro-mini-crsf-temp/crsf.md` before assuming a new sensor's frame type can support multiple instances.

### Board-level pins

CRSF is fixed to the ESP32-C3 Zero's hardware UART0 pins (GPIO20 RX / GPIO21 TX) via a `HardwareSerial(0)` instance in `board.cpp` — not the `Serial` global, which is USB-CDC on this chip, not real UART0. GPS (if added) uses UART1 with a user-selected RX pin; its TX is left disconnected. INA226/BMP280 share the fixed I2C bus (GPIO8 SDA / GPIO9 SCL). All other pin-role sensors pick from `BOARDS.esp32c3_zero.pinPool` (`adc`: GPIO0-4, `digital`: GPIO0-10), excluding whatever's currently reserved/claimed — see `catalog.js`'s `reservedPins`/`i2cPins`/`cautionPins` and `app.js`'s `availablePins()`/`computeConflicts()`.

## Licensing

GPL-3.0. Contact maintainers before commercial integration (see top-level `README.md`).
