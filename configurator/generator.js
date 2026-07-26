/**
 * Assembles a single, self-contained .ino from the sensor selection.
 * Fetches the real firmware/ source files (relative to this page) rather
 * than duplicating their contents here, so the configurator can never
 * drift from what's actually in firmware/.
 *
 * Requires being served over http(s) -- fetch() of local files is blocked
 * by CORS when index.html is opened directly via file://. See README.md
 * for how to serve this locally.
 */

async function fetchText(repoRelativePath) {
    const url = "../" + repoRelativePath; // configurator/ -> repo root is one level up
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${repoRelativePath}: HTTP ${res.status}`);
    return res.text();
}

function basename(path) {
    return path.substring(path.lastIndexOf("/") + 1);
}

const SYSTEM_INCLUDE_RE = /^#include\s+<[^>]+>[ \t]*\r?\n?/gm;
const LOCAL_INCLUDE_RE = /^#include\s+"[^"]+"[ \t]*\r?\n?/gm;
const PRAGMA_ONCE_RE = /^#pragma once[ \t]*\r?\n?/gm;

// Matches a file-scope (column 0) `static` declaration/definition and
// captures its declarator list, e.g. "dig_T2, dig_T3" or "write_reg8" or
// "line[GPS_LINE_MAX]" -- everything up to the first `=`, `;`, or `(`.
const STATIC_DECL_RE = /^static\s+(?:volatile\s+)?[A-Za-z_][A-Za-z0-9_:<>]*\s*\*?\s*(.+?)\s*[=;(]/gm;

function extractFileScopeStaticNames(cpp) {
    const names = new Set();
    for (const m of cpp.matchAll(STATIC_DECL_RE)) {
        for (const decl of m[1].split(",")) {
            const nameMatch = decl.trim().match(/^\*?\s*([A-Za-z_]\w*)/);
            if (nameMatch) names.add(nameMatch[1]);
        }
    }
    return names;
}

// Renames every occurrence of each name in `names` by appending `suffix`,
// via word-boundary matches. Used both for file-scope `static` internals
// (auto-discovered) and for a sensor's explicit public API/macro names
// (instanceSymbols) when a sensor is instantiated more than once, so
// multiple instances of the same sensor type can't collide when merged
// into one translation unit.
function renameSymbols(text, names, suffix) {
    let result = text;
    for (const name of names) {
        result = result.replace(new RegExp(`\\b${name}\\b`, "g"), `${name}${suffix}`);
    }
    return result;
}

// Renames every file-scope `static` symbol in `cpp` by prefixing it with
// `moduleId_`, so that concatenating multiple modules' statics into one
// translation unit can't collide (e.g. both bmp280.cpp and hall_3144e.cpp
// declare `static uint32_t last_poll_ms`). Safe because static symbols have
// internal linkage -- by definition they're only ever referenced within
// their own source file.
function prefixStatics(cpp, moduleId) {
    const names = extractFileScopeStaticNames(cpp);
    let result = cpp;
    for (const name of names) {
        result = result.replace(new RegExp(`\\b${name}\\b`, "g"), `${moduleId}_${name}`);
    }
    return result;
}

// Pulls a #define NAME... line out of `text`, along with any contiguous
// block of "//" comment lines directly above it (so the explanation moves
// with the value into the config block instead of being lost). Returns the
// remaining text and the extracted line (null if NAME wasn't found).
function extractConfigDefine(text, name) {
    const re = new RegExp(`(?:^[ \\t]*//.*\\n)*^#define\\s+${name}\\b.*$\\n?`, "m");
    const m = text.match(re);
    if (!m) return { text, line: null };
    return {
        text: text.slice(0, m.index) + text.slice(m.index + m[0].length),
        line: m[0].replace(/\n$/, ""),
    };
}

// Formats a user-entered number as the float literal style used throughout
// firmware/ (e.g. "100000.0f", "4700.5f") so overridden #define lines stay
// valid C++ float literals ("100000f", with no decimal point, is not).
function formatFloatLiteral(value) {
    const s = String(value).trim();
    return (s.includes(".") ? s : s + ".0") + "f";
}

// Deletes a single line by pattern -- used for plumbing macros that aren't
// user-tunable (their explanatory comments, if any, get swept up by
// stripComments() below regardless of whether the line itself survives).
function removeLine(text, re) {
    return text.replace(re, "");
}

// Strips /* ... */ and /** ... */ block comments and every standalone
// "//" comment line, keeping the file down to functional code. Trailing
// same-line comments (e.g. "n += x; // LSB = 1.25mV") are left alone since
// they can't be orphaned -- they die with their line if the line goes.
function stripComments(text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
}

// Hoists <...> system includes (deduped, moved to the top of the output
// file) and drops local "..." includes (inlined instead) and #pragma once
// (meaningless once everything's one file).
function stripDirectives(text, systemIncludes) {
    for (const m of text.matchAll(SYSTEM_INCLUDE_RE)) systemIncludes.add(m[0].trim());
    return text
        .replace(SYSTEM_INCLUDE_RE, "")
        .replace(LOCAL_INCLUDE_RE, "")
        .replace(PRAGMA_ONCE_RE, "")
        .replace(/^\s+|\s+$/g, "") + "\n";
}

function finalizeBody(text, systemIncludes) {
    return stripDirectives(stripComments(text), systemIncludes);
}

function fileBanner(label) {
    return `// ---- ${label} ----\n`;
}

function sectionBanner(label) {
    return `// ============================================================\n// ${label}\n// ============================================================\n`;
}

/**
 * Assembles a single, self-contained .ino ready to open directly in
 * Arduino IDE -- no folder structure, no companion files, nothing else to
 * download. Only the code the selection actually needs is included: pins
 * and plumbing for unselected sensors are dropped, not just unused.
 * Every value the user might reasonably need to change (pins, baud rate,
 * calibration constants) is collected into one editable block up top.
 *
 * `selection` maps every sensor id to an array of instances (empty if not
 * added): pin-role sensors (hall_3144e, mf58_ntc, voltage_divider,
 * gps_m100_5883) hold the chosen GPIO per entry; I2C sensors (ina226,
 * bmp280) hold a placeholder entry per instance since they need no pin.
 * `maxInstances` in catalog.js caps how many the UI lets you add, but the
 * generator doesn't need to know about the cap -- it just renders
 * whatever's in the array.
 *
 * Sensors with a `pinRole` get their public functions, pin macro, CRSF
 * source_id macro (if the frame type has one), and calibration macros all
 * renamed with a per-instance suffix (and their internal `static` symbols
 * namespaced per instance too), so any number of instances can coexist in
 * one translation unit without colliding.
 */
async function generateArduinoSingleFile(boardId, baud, selection) {
    const board = BOARDS[boardId];
    const systemIncludes = new Set();
    const configLines = [];

    const multiInstances = [];
    for (const sensor of Object.values(SENSORS)) {
        if (!sensor.pinRole) continue;
        const insts = selection[sensor.id] || [];
        insts.forEach((entry, index) => {
            // Entries are { pin, config } objects; `config` holds overrides
            // for any of sensor.configFields the user edited in the UI.
            const pin = typeof entry === "object" && entry !== null ? entry.pin : entry;
            const config = typeof entry === "object" && entry !== null ? entry.config : undefined;
            multiInstances.push({
                sensor,
                index,
                pin,
                config,
                sourceId: sensor.sourceIdBase != null ? sensor.sourceIdBase + index : null,
                label: insts.length > 1 ? `${sensor.name} #${index + 1}` : sensor.name,
            });
        });
    }
    const singleSelected = Object.values(SENSORS).filter((s) => !s.pinRole && (selection[s.id] || []).length > 0);

    const anyI2c = singleSelected.some((s) => s.usesI2c);
    const hasGps = multiInstances.some((inst) => inst.sensor.frame === "0x02 GPS");
    const hasAdc = multiInstances.some((inst) => inst.sensor.usesAdc);

    const sensorList = [...multiInstances.map((i) => i.label), ...singleSelected.map((s) => s.name)].join(", ") || "(none)";

    configLines.push("// --- CRSF ---");
    configLines.push(`#define CRSF_BAUD_RATE ${baud}`);
    configLines.push("");

    // --- board.h: board-wide pins -> config, unused ones dropped ---
    let boardH = await fetchText(board.boardFiles[0]);
    const neededBoardPins = new Set(board.pinDefines.always);
    for (const s of singleSelected) {
        for (const p of board.pinDefines.perSensor[s.id] || []) neededBoardPins.add(p);
    }

    configLines.push(`// --- Board pins (${board.name}) ---`);
    for (const name of board.pinDefines.order) {
        const extracted = extractConfigDefine(boardH, name);
        boardH = extracted.text;
        if (neededBoardPins.has(name) && extracted.line) configLines.push(extracted.line);
    }
    configLines.push("");

    if (!anyI2c) {
        boardH = removeLine(boardH, /^#define I2C_INIT\(\).*$\n?/m);
        boardH = removeLine(boardH, /^#include <Wire\.h>[ \t]*\r?\n?/m);
    }
    if (!hasAdc) boardH = removeLine(boardH, /^#define ADC_MAX_COUNTS\b.*$\n?/m);

    // GpsSerial is a real object (board.cpp), not a #define -- stripped
    // there, alongside its declaration/macro here, when no GPS instance
    // exists. The extern's type (HardwareSerial/SoftwareSerial) and the
    // SoftwareSerial include (Pro Mini only) vary per board, so these match
    // generically rather than naming one board's type.
    if (!hasGps) {
        boardH = removeLine(boardH, /^extern \w+ GpsSerial;.*$\n?/m);
        boardH = removeLine(boardH, /^#define GPS_SERIAL_BEGIN\(\).*$\n?/m);
        boardH = removeLine(boardH, /^#include <SoftwareSerial\.h>[ \t]*\r?\n?/m);
    }

    // --- multi-instance (pin-role) sensors: per-instance pin/source-id/calibration -> config ---
    const multiHeaderTexts = []; // { inst, hText }
    for (const inst of multiInstances) {
        const { sensor, index, pin, config, sourceId, label } = inst;
        const suffix = `_${index}`;
        let hText = await fetchText(sensor.files[0]);

        // The sensor's own default pin/source-id lines (if any) are
        // superseded by generator-synthesized, instance-specific ones.
        hText = removeLine(hText, new RegExp(`^#define\\s+${sensor.pinDefine}\\b.*$\\n?`, "m"));
        if (sensor.sourceIdDefine) hText = removeLine(hText, new RegExp(`^#define\\s+${sensor.sourceIdDefine}\\b.*$\\n?`, "m"));

        const entries = [];
        for (const name of sensor.configDefines) {
            const extracted = extractConfigDefine(hText, name);
            hText = extracted.text;
            let line = extracted.line;
            // configFields values chosen in the UI (e.g. divider resistors,
            // entered in kΩ) override the header's stock default. `scale`
            // converts the UI's display unit back to what the #define wants.
            if (line && config && Object.prototype.hasOwnProperty.call(config, name)) {
                const field = (sensor.configFields || []).find((f) => f.key === name);
                const scale = field && field.scale ? field.scale : 1;
                line = line.replace(
                    new RegExp(`(^#define\\s+${name}\\s+)\\S+`, "m"),
                    (_m, prefix) => prefix + formatFloatLiteral(config[name] * scale)
                );
            }
            if (line) entries.push(line);
        }

        hText = renameSymbols(hText, sensor.instanceSymbols, suffix);

        // Only symbols actually listed in instanceSymbols were renamed above
        // -- a pin/source-id macro left out on purpose (e.g. GPS's
        // PIN_GPS_RX, referenced unsuffixed by board.h/board.cpp) must stay
        // unsuffixed here too, or the config block would define a name
        // nothing else refers to.
        const pinSuffix = sensor.instanceSymbols.includes(sensor.pinDefine) ? suffix : "";
        const sourceIdSuffix = sensor.instanceSymbols.includes(sensor.sourceIdDefine) ? suffix : "";

        configLines.push(`// --- ${label} ---`);
        configLines.push(`#define ${sensor.pinDefine}${pinSuffix} ${pin}   // GPIO${pin}`);
        if (sensor.sourceIdDefine) configLines.push(`#define ${sensor.sourceIdDefine}${sourceIdSuffix} ${sourceId}`);
        for (const line of entries) configLines.push(renameSymbols(line, sensor.instanceSymbols, suffix));
        configLines.push("");

        multiHeaderTexts.push({ inst, hText });
    }

    // --- single-instance sensor headers: calibration -> config ---
    const singleHeaderTexts = {};
    for (const sensor of singleSelected) {
        let hText = await fetchText(sensor.files[0]);
        if (sensor.configDefines && sensor.configDefines.length) {
            configLines.push(`// --- ${sensor.name} ---`);
            for (const name of sensor.configDefines) {
                const extracted = extractConfigDefine(hText, name);
                hText = extracted.text;
                if (extracted.line) configLines.push(extracted.line);
            }
            configLines.push("");
        }
        singleHeaderTexts[sensor.id] = hText;
    }
    while (configLines.length && configLines[configLines.length - 1] === "") configLines.pop();

    // --- assemble headers/implementations, comments stripped ---
    const headerParts = [];
    const implParts = [];

    const crsfH = await fetchText("firmware/common/crsf.h");
    headerParts.push(fileBanner("crsf.h") + finalizeBody(crsfH, systemIncludes));
    const crsfCpp = await fetchText("firmware/common/crsf.cpp");
    implParts.push(fileBanner("crsf.cpp") + finalizeBody(prefixStatics(crsfCpp, "crsf"), systemIncludes));

    headerParts.push(fileBanner("board.h") + finalizeBody(boardH, systemIncludes));
    let boardCpp = await fetchText(board.boardFiles[1]);
    if (!hasGps) boardCpp = removeLine(boardCpp, /^\w+ GpsSerial\([^;]*\);.*$\n?/m);
    implParts.push(fileBanner("board.cpp") + finalizeBody(prefixStatics(boardCpp, "board"), systemIncludes));

    for (const sensor of singleSelected) {
        headerParts.push(fileBanner(basename(sensor.files[0])) + finalizeBody(singleHeaderTexts[sensor.id], systemIncludes));
        const cppText = await fetchText(sensor.files[1]);
        implParts.push(fileBanner(basename(sensor.files[1])) + finalizeBody(prefixStatics(cppText, sensor.id), systemIncludes));
    }

    for (const { inst, hText } of multiHeaderTexts) {
        const { sensor, index, label } = inst;
        const suffix = `_${index}`;
        headerParts.push(fileBanner(`${basename(sensor.files[0])} (${label})`) + finalizeBody(hText, systemIncludes));

        let cppText = await fetchText(sensor.files[1]);
        cppText = prefixStatics(cppText, `${sensor.id}${suffix}`); // internal statics, unique per instance
        cppText = renameSymbols(cppText, sensor.instanceSymbols, suffix); // public API + pin/source-id/config macros
        implParts.push(fileBanner(`${basename(sensor.files[1])} (${label})`) + finalizeBody(cppText, systemIncludes));
    }

    // --- setup()/loop() ---
    let mainBody = await fetchText("firmware/templates/main.cpp.template");
    const initCalls = [
        ...multiInstances.map((inst) => "    " + inst.sensor.initCall(inst.index)),
        ...singleSelected.map((s) => "    " + s.initCall),
    ].join("\n");
    const pollCalls = [
        ...multiInstances.map((inst) => "    " + inst.sensor.pollCall(inst.index)),
        ...singleSelected.map((s) => "    " + s.pollCall),
    ].join("\n");

    mainBody = finalizeBody(mainBody, systemIncludes)
        .replace("{{BOARD_NAME}}", board.name)
        .replace("{{SENSOR_LIST}}", sensorList)
        .replace("{{SENSOR_INCLUDES}}", "") // includes are inlined above, not needed here
        .replace("{{CRSF_INIT_CALL}}", board.crsfInitCall)
        .replace("{{SENSOR_INIT_CALLS}}", initCalls || "    // no sensors selected")
        .replace("{{SENSOR_POLL_CALLS}}", pollCalls || "    // no sensors selected");

    const setupNote = board.arduinoIde.extraSetup ? ` * ${board.arduinoIde.extraSetup}\n *\n` : "";
    const header =
        `/**\n` +
        ` * ELRSense -- single-file Arduino IDE sketch, AUTO-GENERATED.\n` +
        ` * Board: ${board.name}\n` +
        ` * Sensors: ${sensorList}\n` +
        ` *\n` +
        ` * Open this file directly in Arduino IDE (it'll offer to move it into a\n` +
        ` * matching folder -- accept that) and Upload. ${board.arduinoIde.boardMenu}\n` +
        ` *\n${setupNote}` +
        ` * Check the USER CONFIGURATION section right below before flashing --\n` +
        ` * pin mapping, CRSF baud rate, and sensor calibration constants all\n` +
        ` * live there. Regenerate via the configurator rather than hand-editing\n` +
        ` * if you need to change the board or sensor selection.\n` +
        ` */\n`;

    const sortedIncludes = Array.from(systemIncludes).sort();

    const ino = header + "\n" +
        sortedIncludes.join("\n") + "\n\n" +
        sectionBanner("USER CONFIGURATION -- edit these to match your build") +
        configLines.join("\n") + "\n\n" +
        headerParts.join("\n") + "\n" +
        implParts.join("\n") + "\n" +
        sectionBanner("setup() / loop()") + mainBody;

    return { name: `elrsense_${board.id}.ino`, content: ino.replace(/\n{3,}/g, "\n\n") };
}

async function generateAndDownload(boardId, baud, selection) {
    const file = await generateArduinoSingleFile(boardId, baud, selection);
    const blob = new Blob([file.content], { type: "text/x-arduino" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}
