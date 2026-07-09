# ELRSense Configurator

Static, client-side only. Pick a board + sensors, download a PlatformIO
project containing only the code for what you selected. No backend, no
build step, no third-party libraries (the ZIP writer in `zipwriter.js` is
hand-written; see its header comment for why).

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

## Adding a sensor or board

Add one entry to `catalog.js` (pointing at the sensor's `firmware/sensors/<name>/`
files, or the board's `firmware/boards/<name>/` files) and, for a sensor,
create that `firmware/sensors/<name>/` module following the
`init()` / `poll_and_send()` pattern used by the existing ones. Nothing
in `app.js` or `generator.js` needs to change.
