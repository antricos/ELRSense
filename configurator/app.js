/**
 * UI wiring: board select, baud dropdown (options depend on the chosen
 * board), sensor checkboxes with pin-conflict detection, generate button.
 */

const boardSelect = document.getElementById("board-select");
const baudSelect = document.getElementById("baud-select");
const reservedPinsBox = document.getElementById("reserved-pins-box");
const sensorList = document.getElementById("sensor-list");
const conflictBox = document.getElementById("conflict-box");
const generateBtn = document.getElementById("generate-btn");
const statusBox = document.getElementById("status-box");

function currentBoard() {
    return BOARDS[boardSelect.value];
}

function selectedSensorIds() {
    return Array.from(sensorList.querySelectorAll("input[type=checkbox]:checked")).map((el) => el.value);
}

function populateBoards() {
    for (const board of Object.values(BOARDS)) {
        const opt = document.createElement("option");
        opt.value = board.id;
        opt.textContent = board.name;
        boardSelect.appendChild(opt);
    }
}

function renderReservedPins() {
    reservedPinsBox.textContent = "Already used by CRSF wiring: " + currentBoard().reservedPins.join(", ");
}

function populateBaudOptions() {
    baudSelect.innerHTML = "";
    for (const opt of currentBoard().baudOptions) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        baudSelect.appendChild(el);
    }
}

function populateSensors() {
    sensorList.innerHTML = "";
    for (const sensor of Object.values(SENSORS)) {
        const row = document.createElement("label");
        row.className = "sensor-row";
        row.innerHTML = `
            <input type="checkbox" value="${sensor.id}">
            <span class="sensor-name">${sensor.name}${sensor.usesI2c ? " (I2C)" : ""}</span>
            <span class="sensor-frame">${sensor.frame}</span>
        `;
        row.querySelector("input").addEventListener("change", checkConflicts);
        sensorList.appendChild(row);
    }
}

function checkConflicts() {
    const boardId = boardSelect.value;
    const selected = selectedSensorIds().map((id) => SENSORS[id]);

    const seenPins = new Map(); // pin -> sensor name that claimed it
    const conflicts = [];

    for (const sensor of selected) {
        for (const pin of sensor.pinsUsed[boardId] || []) {
            if (seenPins.has(pin)) {
                conflicts.push(`${pin}: needed by both "${seenPins.get(pin)}" and "${sensor.name}"`);
            } else {
                seenPins.set(pin, sensor.name);
            }
        }
    }

    if (conflicts.length) {
        conflictBox.textContent = "Pin conflict -- " + conflicts.join("; ");
        conflictBox.hidden = false;
        generateBtn.disabled = true;
    } else {
        conflictBox.hidden = true;
        generateBtn.disabled = false;
    }
}

boardSelect.addEventListener("change", () => {
    populateBaudOptions();
    renderReservedPins();
    checkConflicts();
});

generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    statusBox.textContent = "Generating...";
    try {
        await generateAndDownload(boardSelect.value, Number(baudSelect.value), selectedSensorIds());
        statusBox.textContent = "Downloaded. Open the project folder in PlatformIO to build and flash.";
    } catch (err) {
        statusBox.textContent = "Generation failed: " + err.message +
            " (this page must be served over http(s), not opened directly as a file -- see README.md)";
    } finally {
        generateBtn.disabled = false;
    }
});

populateBoards();
populateBaudOptions();
renderReservedPins();
populateSensors();
checkConflicts();
