/**
 * Assembles a downloadable PlatformIO project from the board + sensor
 * selection. Fetches the real firmware/ source files (relative to this
 * page) rather than duplicating their contents here, so the configurator
 * can never drift from what's actually in firmware/.
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

async function generateProject(boardId, baud, sensorIds) {
    const board = BOARDS[boardId];
    const sensors = sensorIds.map((id) => SENSORS[id]);

    const files = []; // { name, content }

    files.push({ name: "src/crsf.h", content: await fetchText("firmware/common/crsf.h") });
    files.push({ name: "src/crsf.cpp", content: await fetchText("firmware/common/crsf.cpp") });

    for (const path of board.boardFiles) {
        files.push({ name: "src/" + basename(path), content: await fetchText(path) });
    }

    for (const sensor of sensors) {
        for (const path of sensor.files) {
            files.push({ name: "src/" + basename(path), content: await fetchText(path) });
        }
    }

    let mainCpp = await fetchText("firmware/templates/main.cpp.template");
    const sensorIncludes = sensors.map((s) => `#include "${s.include}"`).join("\n");
    const sensorInitCalls = sensors.map((s) => "    " + s.initCall).join("\n");
    const sensorPollCalls = sensors.map((s) => "    " + s.pollCall).join("\n");
    const sensorList = sensors.length ? sensors.map((s) => s.name).join(", ") : "(none)";

    mainCpp = mainCpp
        .replace("{{BOARD_NAME}}", board.name)
        .replace("{{SENSOR_LIST}}", sensorList)
        .replace("{{SENSOR_INCLUDES}}", sensorIncludes)
        .replace("{{CRSF_INIT_CALL}}", board.crsfInitCall(baud))
        .replace("{{SENSOR_INIT_CALLS}}", sensorInitCalls || "    // no sensors selected")
        .replace("{{SENSOR_POLL_CALLS}}", sensorPollCalls || "    // no sensors selected");

    files.push({ name: "src/main.cpp", content: mainCpp });
    files.push({ name: "platformio.ini", content: await fetchText(board.platformioIni) });

    return files;
}

async function generateAndDownload(boardId, baud, sensorIds) {
    const files = await generateProject(boardId, baud, sensorIds);
    const blob = createZipBlob(files);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `elrsense-${boardId}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}
