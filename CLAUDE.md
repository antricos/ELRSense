# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ELRSense adds custom sensor telemetry (RPM, GPS, current/voltage, barometer, temperature, plain voltage) to ExpressLRS receivers by injecting CRSF frames from an ESP32-C3. There is no build system, package manager, or test suite in this repo — it's a static client-side web app (the "configurator") plus a tree of Arduino/C++ source fragments it assembles.

## Repository layout

- `firmware/` — CRSF frame encoding (`common/`), per-board pin maps/UART setup (`boards/esp32c3_zero/`, `boards/pro_mini/`), and one driver per sensor (`sensors/<name>/`). **Not a standalone buildable project.** Files use unqualified includes like `#include "board.h"` that only resolve once `configurator/generator.js` inlines the selected pieces into one file. Don't try to compile this tree directly.
- `configurator/` — static, dependency-free web app (`catalog.js` + `generator.js` + `app.js` + `index.html`) that lets a user pick sensors, map each to a pin, and download a single self-contained `.ino`. See `configurator/README.md`.
- `reference/pro-mini-crsf-temp/` — a known-working Arduino Pro Mini reference implementation, hand-verified against real hardware (currently a single MF58 NTC thermistor on A3 sending 0x0D TEMP). `crsf.md` there is the CRSF protocol spec and is the source of truth for every frame layout used in `firmware/common/crsf.h`.
- `recources/esp32-c3-zero-pinout.jpg`, `recources/Arduino_Pro_Mini_Pinout.jpg` — per-board pinout diagrams, shown inline in the configurator UI via each board's `pinoutImage` in `catalog.js` (note the folder name typo — matches what's actually referenced in code).

## Running / testing locally

There is no build, lint, or test command. To run the configurator:

```
npx serve .
```

from the repo root, then open `http://localhost:<port>/configurator/`. It **must** be served over http(s) — `generator.js` uses `fetch()` to pull real files from `../firmware/` at generation time (so the configurator can never drift from what's actually in `firmware/`), and `fetch()` of local files is blocked by CORS under `file://`.

There's no automated test suite. The pattern used during development for verifying generator/UI changes: drive `generateArduinoSingleFile()` (or the DOM) directly from a throwaway HTML harness loaded via headless Chrome (`chrome --headless --disable-gpu --no-sandbox --dump-dom`), inspect the generated `.ino` text or DOM state, then delete the harness file. There is no way to actually compile the generated `.ino` in this environment (no arduino-cli/avr-gcc) — that check has to happen on a real machine with Arduino IDE.

## Architecture: how a `.ino` gets assembled

This is the part that needs multiple files to understand:

1. **`catalog.js`** is the single source of truth for board + sensor metadata — pin pools, which `#define` macros are user-tunable (`configDefines`), which sensors get a per-instance pin picker (`pinRole`: `"adc"`, `"digital"`, or `"interrupt"` — the last restricted to pins that support `attachInterrupt()`, which is every GPIO on the ESP32-C3 but only D2/D3 on the Pro Mini), CRSF `source_id` bases, and `instanceSymbols` lists. Adding a sensor means adding one entry here plus its `firmware/sensors/<name>/` files; `app.js` and `generator.js` are never supposed to need touching. Adding a board means adding one `BOARDS` entry plus its `firmware/boards/<name>/` files.
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

On the **ESP32-C3 Zero**, CRSF is fixed to the hardware UART0 pins (GPIO20 RX / GPIO21 TX) via a `HardwareSerial(0)` instance in `board.cpp` — not the `Serial` global, which is USB-CDC on this chip, not real UART0. GPS (if added) uses UART1 with a user-selected RX pin; its TX is left disconnected. INA226/BMP280 share the fixed I2C bus (GPIO8 SDA / GPIO9 SCL). All other pin-role sensors pick from `pinPool` (`adc`: GPIO0-4, `digital`/`interrupt`: GPIO0-10 — any GPIO supports interrupts on this chip), excluding whatever's currently reserved/claimed.

On the **Arduino Pro Mini (3.3V/8MHz)**, CRSF uses the chip's one hardware UART (D0/D1) via the `Serial` global — this project is TX-only, so D0/RX is never driven, but it's still reserved since it's physically shared with the upload/TX line. GPS uses a `SoftwareSerial` on a user-selected pin instead (no second hardware UART available); its TX is left disconnected. I2C is the fixed A4 (SDA, pin 18)/A5 (SCL, pin 19) hardware TWI bus. `pinPool.adc` (A0-A3 = pins 14-17, plus A6/A7 = pins 20/21 — analog-only, no `digitalRead()`/`pinMode()`, but valid for `analogRead()`) and `.digital` (D2-D13) cover most sensors, but `hall_3144e`'s `pinRole: "interrupt"` restricts it to `pinPool.interrupt` (D2/D3 only — the only pins `attachInterrupt()` supports on the 328P). Pin numbering is per `recources/Arduino_Pro_Mini_Pinout.jpg`. At 8MHz the UART can't hit the CRSF-standard ~416666 baud accurately, so this board's `baudOptions` defaults to 256000 (which resolves to the same registers, and thus the same real ~250000 baud, as the validated reference sketch in `reference/pro-mini-crsf-temp/`) instead.

Across both boards, `catalog.js`'s `reservedPins`/`i2cPins`/`cautionPins` and `app.js`'s `availablePins()`/`computeConflicts()` handle the pin-claiming logic generically off whichever board is selected via the configurator's board dropdown (`app.js`'s `BOARD`, reassigned on change).

**Pro Mini gotcha, confirmed on real hardware:** `board.cpp`'s `crsf_uart_init()` calls `Serial.begin(baud)`, whose actual UART divisor is computed from `F_CPU` at compile time — which Arduino IDE sets from **Tools > Processor**, not from the real crystal on the board. The bundled reference sketch (`reference/pro-mini-crsf-temp/crsf_temp_telemetry.ino`) sidesteps this entirely by writing `UBRR0`/`UCSR0A` registers directly, so it's immune to that menu selection. If someone reports a Pro Mini build that flashes clean but produces no telemetry at all (not garbled — nothing), check `Tools > Processor` is exactly `ATmega328P (3.3V, 8MHz)` and not the default `(5V, 16MHz)` before looking anywhere else; the wrong selection silently doubles the real baud rate.

## Licensing

GPL-3.0. Contact maintainers before commercial integration (see top-level `README.md`).
