# ELRSense Firmware Modules

Source modules the configurator (`../configurator/`) assembles into a
single, ready-to-flash Arduino IDE `.ino`. This tree is **not** a
standalone buildable project itself -- sensor/board files use unqualified
includes like `#include "board.h"` / `#include "crsf.h"`, which only
resolve once the generator inlines the selected board + sensor files into
one file (see `configurator/generator.js`).

To build firmware, use the configurator rather than opening this folder
directly in Arduino IDE.

## Layout

- `common/` -- CRSF frame CRC, frame builder, and payload packers for
  every supported frame type. Board- and sensor-agnostic.
- `boards/<board>/board.h` + `board.cpp` -- one module per supported
  board, each exposing the same pin-map/CRSF-UART-init/`crsf_write_byte()`
  contract so sensor drivers stay board-agnostic. Currently
  `esp32c3_zero/` and `pro_mini/` (both TX-only CRSF telemetry
  injectors -- see `reference/pro-mini-crsf-temp/`).
- `sensors/<sensor>/` -- one driver per sensor, each exposing
  `<sensor>_init()` and `<sensor>_poll_and_send()` so the generator can
  wire any combination into one sketch without special-casing.
- `templates/main.cpp.template` -- marker-based `setup()`/`loop()`
  skeleton the generator fills in.

## Adding a sensor

1. Create `sensors/<name>/<name>.h` + `.cpp` following the
   `init()`/`poll_and_send()` pattern of an existing sensor (`mf58_ntc/`
   is the simplest reference).
2. Pack its telemetry via the appropriate `crsf_pack_*()` function in
   `common/crsf.h` (add a new one there if the frame type isn't covered
   yet -- payload layouts come from `reference/pro-mini-crsf-temp/crsf.md`).
3. Add an entry to `configurator/catalog.js` pointing at the new files.
4. Keep the driver board-agnostic: reach for board.h's shared contract
   (`crsf_write_byte()`, `I2C_INIT()`, `ADC_MAX_COUNTS`) rather than a
   board-specific API. If a board-specific call is unavoidable (e.g.
   `gps_m100_5883.cpp`'s `GPS_SERIAL_BEGIN()`, since `HardwareSerial` and
   `SoftwareSerial` have different `begin()` signatures), define a macro
   for it in every board's `board.h` instead of branching in the sensor.

## Adding a board

1. Create `boards/<name>/board.h` + `board.cpp` implementing the same
   contract every other board does: the pin macros `catalog.js`'s
   `pinDefines` expects, `crsf_write_byte()`, `crsf_uart_init(uint32_t)`,
   and (if the board supports GPS) `GPS_SERIAL_BEGIN()` plus a `GpsSerial`
   object of whatever serial type fits the hardware.
2. Add a `BOARDS` entry in `configurator/catalog.js` (pin pools, reserved/
   I2C/caution pins, `pinNames` if the board's native pin labels differ
   from `GPIOn`, baud options, `arduinoIde` menu text). `app.js` and
   `generator.js` read boards generically off `catalog.js` and shouldn't
   need touching.
