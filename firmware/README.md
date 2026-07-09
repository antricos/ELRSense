# ELRSense Firmware Modules

Source modules the configurator (`../configurator/`) assembles into a
ready-to-flash PlatformIO project. This tree is **not** a standalone
buildable project itself -- sensor/board files use unqualified includes
like `#include "board.h"` / `#include "crsf.h"`, which only resolve once
the generator flattens the selected board + sensor files into one `src/`
directory (see `configurator/generator.js`).

To build firmware, use the configurator rather than pointing PlatformIO
directly at this folder.

## Layout

- `common/` -- CRSF frame CRC, frame builder, and payload packers for
  every supported frame type. Board- and sensor-agnostic.
- `boards/<board>/board.h` + `board.cpp` -- pin map, CRSF UART init, and
  `crsf_write_byte()` for that board. Every board is a TX-only CRSF
  telemetry injector (see `reference/pro-mini-crsf-temp/`).
- `sensors/<sensor>/` -- one driver per sensor, each exposing
  `<sensor>_init()` and `<sensor>_poll_and_send()` so the generator can
  wire any combination into one `main.cpp` loop without special-casing.
- `templates/` -- `main.cpp.template` (marker-based skeleton the
  generator fills in) and one `platformio.ini.<board>` per board.

## Adding a sensor

1. Create `sensors/<name>/<name>.h` + `.cpp` following the
   `init()`/`poll_and_send()` pattern of an existing sensor (`mf58_ntc/`
   is the simplest reference).
2. Pack its telemetry via the appropriate `crsf_pack_*()` function in
   `common/crsf.h` (add a new one there if the frame type isn't covered
   yet -- payload layouts come from `reference/pro-mini-crsf-temp/crsf.md`).
3. Add an entry to `configurator/catalog.js` pointing at the new files.
