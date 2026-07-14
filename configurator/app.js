/**
 * UI wiring: baud dropdown, per-sensor "+ Add" button + instance list
 * (pin dropdown for pin-role sensors, none for shared-I2C-bus ones),
 * generate button. Board is fixed to the ESP32-C3 Zero (the only one
 * currently supported).
 */

const BOARD = BOARDS.esp32c3_zero;

const baudSelect = document.getElementById("baud-select");
const reservedPinsBox = document.getElementById("reserved-pins-box");
const sensorList = document.getElementById("sensor-list");
const conflictBox = document.getElementById("conflict-box");
const generateBtn = document.getElementById("generate-btn");
const statusBox = document.getElementById("status-box");

// Every sensor id -> array of instances. Pin-role sensors store a
// { pin, config } object per entry (`config` maps each of the sensor's
// configFields keys, if any, to the value chosen in the UI); I2C sensors
// (no pinRole) store `true` as a placeholder.
const state = {};
for (const sensor of Object.values(SENSORS)) state[sensor.id] = [];

function maxInstancesFor(sensor) {
    return sensor.maxInstances || Infinity;
}

function defaultConfigFor(sensor) {
    const config = {};
    for (const field of sensor.configFields || []) config[field.key] = field.default;
    return config;
}

function renderReservedPins() {
    const always = Object.entries(BOARD.reservedPins).map(([pin, label]) => `GPIO${pin} (${label})`);
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
    let label = `GPIO${pin}`;
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
                conflicts.push(`${label}: GPIO${pin} is reserved (${why})`);
            }
            if (seen.has(pin)) conflicts.push(`GPIO${pin}: needed by both "${seen.get(pin)}" and "${label}"`);
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
    const atMax = state[sensor.id].length >= max;
    const noPinsLeft = sensor.pinRole && availablePins(sensor.pinRole, null).length === 0;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-instance-btn";
    addBtn.textContent = "+ Add";
    if (atMax || noPinsLeft) {
        addBtn.disabled = true;
        addBtn.title = atMax ? "Maximum instances reached" : "No free pins left for this sensor type";
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

    if (sensor.pinNote) {
        const note = document.createElement("div");
        note.className = "sensor-pin-note";
        note.textContent = sensor.pinNote;
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
}

generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    statusBox.textContent = "Generating...";
    try {
        await generateAndDownload(Number(baudSelect.value), state);
        statusBox.textContent = "Downloaded. Open the .ino directly in Arduino IDE, select your board, and Upload.";
    } catch (err) {
        statusBox.textContent = "Generation failed: " + err.message +
            " (this page must be served over http(s), not opened directly as a file -- see README.md)";
    } finally {
        generateBtn.disabled = false;
    }
});

populateBaudOptions();
renderReservedPins();
renderSensors();
