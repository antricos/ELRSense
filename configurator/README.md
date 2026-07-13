# ELRSense Configurator

Static, client-side only. Currently targets the **ESP32-C3 Zero** only.
Pick the sensors you're using, download a single, self-contained
**Arduino IDE `.ino` file** with only the code that selection needs
inlined -- nothing else to download, just open it in Arduino IDE and
Upload. No backend, no third-party libraries.

Every value you might need to change for your own build (pin mapping,
CRSF baud rate, sensor calibration constants) is collected into one
`USER CONFIGURATION` block at the top of the generated file -- check that
before flashing.

CRSF always uses the board's fixed UART0 pins (GPIO20 RX / GPIO21 TX).
Every sensor uses the same "+ Add" control. Hall/thermistor/voltage-divider/
GPS sensors each get a per-instance GPIO dropdown (GPS's on UART1). INA226
and BMP280 share a fixed I2C bus (GPIO8 SDA / GPIO9 SCL), so "+ Add" for
them just adds/removes the sensor -- no pin to pick.

GPS, INA226, and BMP280 are capped at one instance -- their CRSF frame
types (0x02, 0x08, 0x09) have no `source_id` field, so a second instance
would just silently overwrite the first's reading with no way for the
receiver to tell them apart. hall_3144e/mf58_ntc/voltage_divider's frames
(0x0C, 0x0D, 0x0E) all carry a source_id, so they're uncapped.

## Running locally

`generator.js` fetches the real files from `../firmware/` at generation
time (so the configurator can never drift from what's actually there),
which means it must be served over http(s) -- opening `index.html`
directly via `file://` will fail those fetches due to CORS. From the repo
root:

```
npx serve .
```

Then open the configurator at whatever URL that prints (e.g.
`http://localhost:3000/configurator/`).

## Deploying

Host the whole repo (or just this folder, adjusting the `../firmware/`
relative paths in `generator.js` if you split it out) on GitHub Pages or
any static file host -- same-origin fetches work there with no
configuration needed.

## Adding a sensor

Add one entry to `catalog.js` pointing at the sensor's
`firmware/sensors/<name>/` files, and create that module following the
`init()` / `poll_and_send()` pattern used by the existing ones. If it has
values a user would want to tune (calibration constants, addresses), list
their exact `#define` names in `configDefines` so the generator pulls them
into the config block.

If the sensor needs its own pin (a GPIO, not the shared I2C bus), set
`pinRole` (`"adc"` or `"digital"`), `pinDefine` (the macro name its own
header/source reference for that pin), `instanceSymbols` (every public
function name + macro name -- pin, source_id if any, calibration
constants -- that needs a per-instance suffix so multiple instances don't
collide), and `initCall`/`pollCall` as `(i) => "..."` functions instead of
plain strings. If its CRSF frame type carries a `source_id` (check
`reference/pro-mini-crsf-temp/crsf.md`), also set `sourceIdBase` and
`sourceIdDefine`; if the frame type has no source_id (like GPS's 0x02),
set `sourceIdDefine: null` and `maxInstances: 1`.

If the sensor has no pin of its own (shares I2C, like ina226/bmp280),
leave `pinRole` unset -- it'll render as a plain "+ Add" with no dropdown.
Set `maxInstances: 1` if its CRSF frame type has no source_id.

Nothing in `app.js` or `generator.js` needs to change either way.
