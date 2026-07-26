/**
 * UI wiring: board dropdown, baud dropdown, per-sensor "+ Add" button +
 * instance list (pin dropdown for pin-role sensors, none for
 * shared-I2C-bus ones), generate button.
 */

let BOARD = BOARDS.esp32c3_zero;

const boardSelect = document.getElementById("board-select");
const boardBadge = document.getElementById("board-badge");
const baudSelect = document.getElementById("baud-select");
const reservedPinsBox = document.getElementById("reserved-pins-box");
const pinoutDetails = document.getElementById("pinout-details");
const pinoutSummary = document.getElementById("pinout-summary");
const pinoutViewer = document.getElementById("pinout-viewer");
const pinoutStage = document.getElementById("pinout-stage");
const pinoutImg = document.getElementById("pinout-img");
const pinoutOverlay = document.getElementById("pinout-overlay");
const pinoutStageWrap = document.getElementById("pinout-stage-wrap");
const pinoutConnections = document.getElementById("pinout-connections");
const pinoutWires = document.getElementById("pinout-wires");
const sensorInfoBackdrop = document.getElementById("sensor-info-backdrop");
const sensorInfoModal = document.getElementById("sensor-info-modal");
const sensorInfoIcon = document.getElementById("sensor-info-icon");
const sensorInfoTitle = document.getElementById("sensor-info-title");
const sensorInfoImage = document.getElementById("sensor-info-image");
const sensorInfoClose = document.getElementById("sensor-info-close");
const pinoutZoomIn = document.getElementById("pinout-zoom-in");
const pinoutZoomOut = document.getElementById("pinout-zoom-out");
const pinoutZoomReset = document.getElementById("pinout-zoom-reset");
const sensorList = document.getElementById("sensor-list");
const conflictBox = document.getElementById("conflict-box");
const generateBtn = document.getElementById("generate-btn");
const statusBox = document.getElementById("status-box");

function populateBoardOptions() {
    boardSelect.innerHTML = "";
    for (const board of Object.values(BOARDS)) {
        const el = document.createElement("option");
        el.value = board.id;
        el.textContent = board.name;
        if (board.id === BOARD.id) el.selected = true;
        boardSelect.appendChild(el);
    }
}

function renderPinoutImage() {
    if (BOARD.pinoutImage) {
        pinoutDetails.hidden = false;
        pinoutSummary.textContent = `View ${BOARD.name} pinout diagram`;
        pinoutImg.src = "../" + BOARD.pinoutImage;
        pinoutImg.alt = `${BOARD.name} pinout diagram`;
    } else {
        pinoutDetails.hidden = true;
    }
    resetPinoutZoom();
}

// Live-highlight claimed/reserved pins on the pinout diagram, keyed off the
// same board.pinCoords percentage map used to place each marker.
function renderPinoutOverlay() {
    pinoutOverlay.innerHTML = "";
    if (!BOARD.pinCoords) return;

    function addMarker(pin, cls, title) {
        const coord = BOARD.pinCoords[pin];
        if (!coord) return;
        const marker = document.createElement("div");
        marker.className = "pin-marker " + cls;
        marker.style.left = coord[0] + "%";
        marker.style.top = coord[1] + "%";
        marker.title = title;
        pinoutOverlay.appendChild(marker);
    }

    for (const [pin, reason] of Object.entries(BOARD.reservedPins)) {
        addMarker(Number(pin), "reserved", `${pinName(Number(pin))} -- reserved (${reason})`);
    }
    if (state.ina226.length || state.bmp280.length) {
        for (const [pin, reason] of Object.entries(BOARD.i2cPins)) {
            addMarker(Number(pin), "i2c-active", `${pinName(Number(pin))} -- ${reason}`);
        }
    }
    for (const sensor of Object.values(SENSORS)) {
        if (!sensor.pinRole) continue;
        state[sensor.id].forEach((inst, index) => {
            const suffix = state[sensor.id].length > 1 ? ` #${index + 1}` : "";
            const cautionCls = BOARD.cautionPins[inst.pin] ? " caution" : "";
            addMarker(inst.pin, "claimed" + cautionCls, `${pinName(inst.pin)} -- ${sensor.name}${suffix}`);
        });
    }
}

// "Click add a sensor -> an animated wire draws out to it" visualization:
// one card per connected instance in the side column, wired to the pin it
// claims (or, for shared-bus I2C sensors with no pin of their own, the
// bus's SDA pin). pinoutConnectionEls is rebuilt any time the sensor list
// changes; renderWires() alone re-runs on every pan/zoom frame since a
// pin's screen position depends on the live transform.
let pinoutConnectionEls = []; // [{ pin, cardEl }]

function connectionsList() {
    const list = [];
    for (const sensor of Object.values(SENSORS)) {
        if (sensor.pinRole) {
            state[sensor.id].forEach((inst, index) => {
                const suffix = state[sensor.id].length > 1 ? ` #${index + 1}` : "";
                list.push({ pin: inst.pin, icon: sensor.icon, name: sensor.name + suffix, pinLabel: pinName(inst.pin), wiringImage: sensor.wiringImage });
            });
        } else if (sensor.usesI2c && state[sensor.id].length) {
            const [sdaPin, sclPin] = Object.keys(BOARD.i2cPins).map(Number);
            const pinLabel = `SDA ${pinName(sdaPin)} / SCL ${pinName(sclPin)}`;
            list.push({ pin: sdaPin, icon: sensor.icon, name: sensor.name, pinLabel, wiringImage: sensor.wiringImage });
        }
    }
    return list;
}

function openSensorInfo(icon, name, imagePath) {
    sensorInfoIcon.textContent = icon;
    sensorInfoTitle.textContent = name;
    sensorInfoImage.src = "../" + imagePath;
    sensorInfoImage.alt = `${name} wiring diagram`;
    sensorInfoBackdrop.hidden = false;
    sensorInfoModal.hidden = false;
}

function closeSensorInfo() {
    sensorInfoBackdrop.hidden = true;
    sensorInfoModal.hidden = true;
}

sensorInfoClose.addEventListener("click", closeSensorInfo);
sensorInfoBackdrop.addEventListener("click", closeSensorInfo);
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sensorInfoModal.hidden) closeSensorInfo();
});

function renderConnections() {
    pinoutConnections.innerHTML = "";
    pinoutConnectionEls = [];
    for (const conn of connectionsList()) {
        if (!BOARD.pinCoords[conn.pin]) continue;
        const card = document.createElement(conn.wiringImage ? "button" : "div");
        card.className = "connection-card" + (conn.wiringImage ? " has-info" : "");
        if (conn.wiringImage) {
            card.type = "button";
            card.title = "Click for a wiring diagram";
        }
        const icon = document.createElement("span");
        icon.className = "card-icon";
        icon.textContent = conn.icon;
        const text = document.createElement("span");
        text.className = "card-text";
        const name = document.createElement("span");
        name.className = "card-name";
        name.textContent = conn.name;
        const pin = document.createElement("span");
        pin.className = "card-pin";
        pin.textContent = conn.pinLabel;
        text.append(name, pin);
        card.append(icon, text);
        if (conn.wiringImage) {
            card.addEventListener("click", () => openSensorInfo(conn.icon, conn.name, conn.wiringImage));
        }
        pinoutConnections.appendChild(card);
        pinoutConnectionEls.push({ pin: conn.pin, cardEl: card });
    }
    renderWires();
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderWires() {
    pinoutWires.innerHTML = "";
    if (!pinoutConnectionEls.length) return;
    const wrapRect = pinoutStageWrap.getBoundingClientRect();
    const viewerRect = pinoutViewer.getBoundingClientRect();
    const imgRect = pinoutImg.getBoundingClientRect();
    // The image (or the <details> it lives in) may not have finished
    // loading/laying out yet on the very first render after a sensor is
    // added -- rather than draw a wire from a bogus (0,0) rect, skip this
    // pass; the pending "load" listener below re-renders once it's ready.
    if (!imgRect.width || !imgRect.height) return;
    for (const { pin, cardEl } of pinoutConnectionEls) {
        const coord = BOARD.pinCoords[pin];
        if (!coord) continue;
        const pinX = imgRect.left + (coord[0] / 100) * imgRect.width;
        const pinY = imgRect.top + (coord[1] / 100) * imgRect.height;
        // Skip a wire whose pin has been panned/zoomed outside the visible
        // diagram viewport rather than draw it through the crop.
        if (pinX < viewerRect.left || pinX > viewerRect.right || pinY < viewerRect.top || pinY > viewerRect.bottom) continue;

        const cardRect = cardEl.getBoundingClientRect();
        const startX = pinX - wrapRect.left;
        const startY = pinY - wrapRect.top;
        const endX = cardRect.left - wrapRect.left;
        const endY = cardRect.top + cardRect.height / 2 - wrapRect.top;
        const midX = (startX + endX) / 2;

        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "wire-path");
        path.setAttribute("d", `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`);
        pinoutWires.appendChild(path);
    }
}

pinoutDetails.addEventListener("toggle", () => {
    if (pinoutDetails.open) renderWires();
});
window.addEventListener("resize", () => renderWires());
pinoutImg.addEventListener("load", () => renderWires());

// --- Pinout diagram zoom/pan -------------------------------------------
// Wheel/pinch to zoom (about the cursor/pinch midpoint), drag to pan.
// Pointer Events cover both mouse and touch in one code path; a second
// active pointer (touch) upgrades a pan into a pinch-zoom.
const PINOUT_MIN_SCALE = 1;
const PINOUT_MAX_SCALE = 6;
let pinoutScale = 1;
let pinoutX = 0;
let pinoutY = 0;
const pinoutPointers = new Map();
let pinoutPanStart = null; // { x, y, origX, origY }
let pinoutPinchStart = null; // { dist, scale, x, y, midX, midY }

function applyPinoutTransform() {
    pinoutStage.style.transform = `translate(${pinoutX}px, ${pinoutY}px) scale(${pinoutScale})`;
    pinoutZoomReset.textContent = `${Math.round(pinoutScale * 100)}%`;
    renderWires();
}

function resetPinoutZoom() {
    pinoutScale = 1;
    pinoutX = 0;
    pinoutY = 0;
    applyPinoutTransform();
}

// Zooms by `factor` while keeping the point at (clientX, clientY) fixed on
// screen -- the standard "zoom toward cursor" feel.
function zoomPinoutAt(factor, clientX, clientY) {
    const newScale = Math.min(PINOUT_MAX_SCALE, Math.max(PINOUT_MIN_SCALE, pinoutScale * factor));
    if (newScale === pinoutScale) return;
    const rect = pinoutViewer.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    pinoutX = cx - ((cx - pinoutX) / pinoutScale) * newScale;
    pinoutY = cy - ((cy - pinoutY) / pinoutScale) * newScale;
    pinoutScale = newScale;
    if (pinoutScale === PINOUT_MIN_SCALE) { pinoutX = 0; pinoutY = 0; }
    applyPinoutTransform();
}

pinoutViewer.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomPinoutAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
}, { passive: false });

function zoomPinoutAtCenter(factor) {
    const rect = pinoutViewer.getBoundingClientRect();
    zoomPinoutAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
}
pinoutZoomIn.addEventListener("click", () => zoomPinoutAtCenter(1.25));
pinoutZoomOut.addEventListener("click", () => zoomPinoutAtCenter(1 / 1.25));
pinoutZoomReset.addEventListener("click", resetPinoutZoom);

pinoutViewer.addEventListener("pointerdown", (e) => {
    pinoutViewer.setPointerCapture(e.pointerId);
    pinoutPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinoutPointers.size === 1) {
        pinoutPanStart = { x: e.clientX, y: e.clientY, origX: pinoutX, origY: pinoutY };
        pinoutPinchStart = null;
        pinoutViewer.classList.add("dragging");
    } else if (pinoutPointers.size === 2) {
        pinoutPanStart = null;
        const [p0, p1] = Array.from(pinoutPointers.values());
        const rect = pinoutViewer.getBoundingClientRect();
        pinoutPinchStart = {
            dist: Math.hypot(p0.x - p1.x, p0.y - p1.y),
            scale: pinoutScale,
            x: pinoutX,
            y: pinoutY,
            midX: (p0.x + p1.x) / 2 - rect.left,
            midY: (p0.y + p1.y) / 2 - rect.top,
        };
    }
});

pinoutViewer.addEventListener("pointermove", (e) => {
    if (!pinoutPointers.has(e.pointerId)) return;
    pinoutPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinoutPointers.size === 1 && pinoutPanStart) {
        pinoutX = pinoutPanStart.origX + (e.clientX - pinoutPanStart.x);
        pinoutY = pinoutPanStart.origY + (e.clientY - pinoutPanStart.y);
        applyPinoutTransform();
    } else if (pinoutPointers.size === 2 && pinoutPinchStart) {
        const [p0, p1] = Array.from(pinoutPointers.values());
        const dist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
        const { scale: startScale, x: startX, y: startY, midX, midY } = pinoutPinchStart;
        const newScale = Math.min(PINOUT_MAX_SCALE, Math.max(PINOUT_MIN_SCALE, startScale * (dist / pinoutPinchStart.dist)));
        pinoutX = midX - ((midX - startX) / startScale) * newScale;
        pinoutY = midY - ((midY - startY) / startScale) * newScale;
        pinoutScale = newScale;
        applyPinoutTransform();
    }
});

function endPinoutPointer(e) {
    pinoutPointers.delete(e.pointerId);
    if (pinoutPointers.size < 2) pinoutPinchStart = null;
    if (pinoutPointers.size === 0) {
        pinoutPanStart = null;
        pinoutViewer.classList.remove("dragging");
    }
}
pinoutViewer.addEventListener("pointerup", endPinoutPointer);
pinoutViewer.addEventListener("pointercancel", endPinoutPointer);
pinoutViewer.addEventListener("pointerleave", (e) => { if (e.buttons === 0) endPinoutPointer(e); });

boardSelect.addEventListener("change", () => {
    BOARD = BOARDS[boardSelect.value];
    boardBadge.textContent = BOARD.name;
    // Pins chosen for one board's pinPool generally aren't valid on the
    // other's -- reset every sensor's instances rather than carry over
    // stale pin numbers.
    for (const sensor of Object.values(SENSORS)) state[sensor.id] = [];
    populateBaudOptions();
    renderReservedPins();
    renderPinoutImage();
    renderSensors();
});

// Every sensor id -> array of instances. Pin-role sensors store a
// { pin, config } object per entry (`config` maps each of the sensor's
// configFields keys, if any, to the value chosen in the UI); I2C sensors
// (no pinRole) store `true` as a placeholder.
const state = {};
for (const sensor of Object.values(SENSORS)) state[sensor.id] = [];

function maxInstancesFor(sensor) {
    return sensor.maxInstances || Infinity;
}

// `maxInstances: 1` means the sensor's CRSF frame type has no source_id
// field -- there's no way for the receiver to tell two instances apart.
// That's just as true across two *different* sensor ids that emit the same
// frame (e.g. two distinct GPS modules both sending 0x02) as it is for two
// instances of the same one, so the cap is enforced per frame, not per id.
function frameGroupSensors(sensor) {
    return Object.values(SENSORS).filter((s) => s.maxInstances === 1 && s.frame === sensor.frame);
}

function frameGroupHasInstance(sensor, excludingSelf) {
    return frameGroupSensors(sensor).some((s) => (excludingSelf && s.id === sensor.id ? false : state[s.id].length > 0));
}

function defaultConfigFor(sensor) {
    const config = {};
    for (const field of sensor.configFields || []) config[field.key] = field.default;
    return config;
}

// Board-native pin name (e.g. "A6", "D5" on the Pro Mini) if the board
// defines one (`pinNames`), else the ESP32-C3's native "GPIOn" numbering.
function pinName(pin) {
    return (BOARD.pinNames && BOARD.pinNames[pin]) || `GPIO${pin}`;
}

function renderReservedPins() {
    const always = Object.entries(BOARD.reservedPins).map(([pin, label]) => `${pinName(Number(pin))} (${label})`);
    reservedPinsBox.textContent = "Always reserved: " + always.join(", ");
}

function populateBaudOptions() {
    baudSelect.innerHTML = "";
    for (const opt of BOARD.baudOptions) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        if (opt.default) el.selected = true;
        baudSelect.appendChild(el);
    }
}

function claimedPins() {
    const set = new Set();
    for (const sensor of Object.values(SENSORS)) {
        if (sensor.pinRole) for (const inst of state[sensor.id]) set.add(inst.pin);
    }
    return set;
}

function reservedPinSet() {
    const set = new Set(Object.keys(BOARD.reservedPins).map(Number));
    if (state.ina226.length || state.bmp280.length) {
        for (const p of Object.keys(BOARD.i2cPins).map(Number)) set.add(p);
    }
    return set;
}

function pinLabel(pin) {
    let label = pinName(pin);
    if (BOARD.cautionPins[pin]) label += ` (shared: ${BOARD.cautionPins[pin]})`;
    return label;
}

// Pins selectable for `role`, excluding whatever's already claimed/reserved
// -- except `keepPin`, which stays offered so a select can keep showing its
// own current value even if something else claimed it since.
function availablePins(role, keepPin) {
    const claimed = claimedPins();
    const reserved = reservedPinSet();
    return BOARD.pinPool[role].filter((p) => p === keepPin || (!claimed.has(p) && !reserved.has(p)));
}

function computeConflicts() {
    const reserved = reservedPinSet();
    const conflicts = [];
    const seen = new Map();

    for (const sensor of Object.values(SENSORS)) {
        if (!sensor.pinRole) continue;
        const insts = state[sensor.id];
        insts.forEach((inst, i) => {
            const pin = inst.pin;
            const label = insts.length > 1 ? `${sensor.name} #${i + 1}` : sensor.name;
            if (reserved.has(pin)) {
                const why = BOARD.reservedPins[pin] || BOARD.i2cPins[pin];
                conflicts.push(`${label}: ${pinName(pin)} is reserved (${why})`);
            }
            if (seen.has(pin)) conflicts.push(`${pinName(pin)}: needed by both "${seen.get(pin)}" and "${label}"`);
            else seen.set(pin, label);
        });
    }
    return conflicts;
}

function renderSensorGroup(sensor) {
    const wrap = document.createElement("div");
    wrap.className = "sensor-group";

    const header = document.createElement("div");
    header.className = "sensor-group-header";
    header.innerHTML = `<span class="sensor-name">${sensor.name}</span>`;

    const max = maxInstancesFor(sensor);
    const atOwnMax = state[sensor.id].length >= max;
    // Own count is already covered by atOwnMax; this only adds the case
    // where a *sibling* sensor sharing the same source_id-less frame holds
    // the slot instead.
    const blockedBySibling = sensor.maxInstances === 1 && frameGroupHasInstance(sensor, true);
    const atMax = atOwnMax || blockedBySibling;
    const noPinsLeft = sensor.pinRole && availablePins(sensor.pinRole, null).length === 0;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-instance-btn";
    addBtn.textContent = "+ Add";
    if (atMax || noPinsLeft) {
        addBtn.disabled = true;
        addBtn.title = blockedBySibling
            ? `Only one ${sensor.frame} sensor can be added at a time`
            : atMax ? "Maximum instances reached" : "No free pins left for this sensor type";
    }
    addBtn.addEventListener("click", () => {
        if (sensor.pinRole) {
            const options = availablePins(sensor.pinRole, null);
            if (!options.length) return;
            state[sensor.id].push({ pin: options[0], config: defaultConfigFor(sensor) });
        } else {
            state[sensor.id].push(true);
        }
        renderSensors();
    });
    header.appendChild(addBtn);
    wrap.appendChild(header);

    // I2C sensors (no pinRole) share the board's fixed bus -- the note
    // naming its pins has to come from the selected board (BOARD.i2cPins),
    // not a catalog string, since the bus lives on different pins per
    // board. i2cPins' numeric keys iterate low-to-high, which happens to
    // match SDA-then-SCL for every board defined so far.
    if (sensor.usesI2c && !sensor.pinRole) {
        const pins = Object.entries(BOARD.i2cPins).map(([pin, label]) => `${pinName(Number(pin))} ${label.replace(/^I2C /, "")}`);
        const note = document.createElement("div");
        note.className = "sensor-pin-note";
        note.textContent = `Shared I2C bus (${pins.join(" / ")}) -- no pin to pick.`;
        wrap.appendChild(note);
    }

    const instList = document.createElement("div");
    instList.className = "instance-list";

    state[sensor.id].forEach((inst, index) => {
        const row = document.createElement("div");
        row.className = "instance-row";

        const label = document.createElement("span");
        label.className = "instance-label";
        label.textContent = state[sensor.id].length > 1 ? `#${index + 1}` : "";
        row.appendChild(label);

        if (sensor.pinRole) {
            const select = document.createElement("select");
            for (const p of availablePins(sensor.pinRole, inst.pin)) {
                const opt = document.createElement("option");
                opt.value = String(p);
                opt.textContent = pinLabel(p);
                if (p === inst.pin) opt.selected = true;
                select.appendChild(opt);
            }
            select.addEventListener("change", () => {
                state[sensor.id][index].pin = Number(select.value);
                renderSensors();
            });
            row.appendChild(select);
        }

        // sensor.voltageRange (voltage_divider only) drives a derived,
        // editable "max voltage" field below -- these two functions keep it
        // and the R_TOP/R_BOTTOM inputs in sync with each other.
        const fieldInputs = {};
        let voltageInput = null;

        function computeMaxVoltage() {
            const vr = sensor.voltageRange;
            if (!vr) return null;
            const topK = Number(inst.config[vr.topKey]);
            const bottomK = Number(inst.config[vr.bottomKey]);
            if (!Number.isFinite(topK) || !Number.isFinite(bottomK) || bottomK <= 0) return null;
            return (vr.vrefMv / 1000) * (topK + bottomK) / bottomK;
        }
        function syncVoltageRange() {
            if (!voltageInput) return;
            const v = computeMaxVoltage();
            if (v != null) voltageInput.value = Math.round(v * 100) / 100;
        }

        for (const field of sensor.configFields || []) {
            const fieldLabel = document.createElement("label");
            fieldLabel.className = "config-field-label";
            fieldLabel.textContent = field.label + (field.unit ? ` (${field.unit})` : "");

            const input = document.createElement("input");
            input.type = "number";
            input.step = "any";
            input.className = "config-field-input";
            input.value = inst.config[field.key];
            input.addEventListener("input", () => {
                const v = parseFloat(input.value);
                inst.config[field.key] = Number.isFinite(v) ? v : field.default;
                syncVoltageRange();
            });
            fieldInputs[field.key] = input;

            fieldLabel.appendChild(input);
            row.appendChild(fieldLabel);
        }

        if (sensor.voltageRange) {
            const vr = sensor.voltageRange;
            const fieldLabel = document.createElement("label");
            fieldLabel.className = "config-field-label voltage-range-label";
            fieldLabel.textContent = `${vr.label} (${vr.unit})`;
            fieldLabel.title = `Assumes a ${(vr.vrefMv / 1000).toFixed(1)}V ADC reference (VDIV_VREF_MV default). ` +
                `Editing this proposes a new ${sensor.configFields.find((f) => f.key === vr.topKey).label} with ` +
                `${sensor.configFields.find((f) => f.key === vr.bottomKey).label} held fixed.`;

            voltageInput = document.createElement("input");
            voltageInput.type = "number";
            voltageInput.step = "any";
            voltageInput.className = "config-field-input voltage-range-input";
            const initial = computeMaxVoltage();
            voltageInput.value = initial != null ? Math.round(initial * 100) / 100 : "";
            voltageInput.addEventListener("input", () => {
                const desired = parseFloat(voltageInput.value);
                const bottomK = Number(inst.config[vr.bottomKey]);
                if (!Number.isFinite(desired) || !Number.isFinite(bottomK) || bottomK <= 0) return;
                const vrefV = vr.vrefMv / 1000;
                let proposedTop = Math.round(bottomK * (desired / vrefV - 1) * 100) / 100;
                if (!Number.isFinite(proposedTop) || proposedTop < 0) proposedTop = 0;
                inst.config[vr.topKey] = proposedTop;
                if (fieldInputs[vr.topKey]) fieldInputs[vr.topKey].value = proposedTop;
            });

            fieldLabel.appendChild(voltageInput);
            row.appendChild(fieldLabel);
        }

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove-instance-btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            state[sensor.id].splice(index, 1);
            renderSensors();
        });
        row.appendChild(removeBtn);

        instList.appendChild(row);
    });

    wrap.appendChild(instList);
    return wrap;
}

function renderSensors() {
    sensorList.innerHTML = "";
    const sensorsByGroup = new Map(SENSOR_GROUPS.map((g) => [g.id, []]));
    for (const sensor of Object.values(SENSORS)) sensorsByGroup.get(sensorGroupId(sensor)).push(sensor);

    for (const group of SENSOR_GROUPS) {
        const sensors = sensorsByGroup.get(group.id);
        if (!sensors.length) continue;

        const section = document.createElement("div");
        section.className = "sensor-group-section";

        const heading = document.createElement("div");
        heading.className = "sensor-group-heading";
        heading.textContent = group.label;
        section.appendChild(heading);

        if (group.hint) {
            const hint = document.createElement("div");
            hint.className = "sensor-group-hint";
            hint.textContent = group.hint;
            section.appendChild(hint);
        }

        for (const sensor of sensors) section.appendChild(renderSensorGroup(sensor));
        sensorList.appendChild(section);
    }

    const conflicts = computeConflicts();
    if (conflicts.length) {
        conflictBox.textContent = "Pin conflict -- " + conflicts.join("; ");
        conflictBox.hidden = false;
        generateBtn.disabled = true;
    } else {
        conflictBox.hidden = true;
        generateBtn.disabled = false;
    }
    renderPinoutOverlay();
    renderConnections();
}

generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    statusBox.textContent = "Generating...";
    try {
        await generateAndDownload(BOARD.id, Number(baudSelect.value), state);
        statusBox.textContent = "Downloaded. Open the .ino directly in Arduino IDE, select your board, and Upload.";
    } catch (err) {
        statusBox.textContent = "Generation failed: " + err.message +
            " (this page must be served over http(s), not opened directly as a file -- see README.md)";
    } finally {
        generateBtn.disabled = false;
    }
});

populateBoardOptions();
boardBadge.textContent = BOARD.name;
populateBaudOptions();
renderReservedPins();
renderPinoutImage();
renderSensors();

// --- Theme toggle --------------------------------------------------------
const themeToggle = document.getElementById("theme-toggle");

function currentTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.checked = theme === "dark";
}

applyTheme(currentTheme());

themeToggle.addEventListener("change", () => {
    const next = themeToggle.checked ? "dark" : "light";
    localStorage.setItem("theme", next);
    applyTheme(next);
});

// --- Experimental/preview notice ------------------------------------------
// Shown once per browser (persisted in localStorage) until acknowledged.
const experimentalBackdrop = document.getElementById("experimental-backdrop");
const experimentalModal = document.getElementById("experimental-modal");
const experimentalContinue = document.getElementById("experimental-continue");

if (!localStorage.getItem("experimentalAck")) {
    experimentalBackdrop.hidden = false;
    experimentalModal.hidden = false;
}

experimentalContinue.addEventListener("click", () => {
    localStorage.setItem("experimentalAck", "1");
    experimentalBackdrop.hidden = true;
    experimentalModal.hidden = true;
});
