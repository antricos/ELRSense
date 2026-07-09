/**
 * Single source of truth for board + sensor metadata. Adding a sensor or
 * board means adding one entry here (plus its firmware/ source files) --
 * app.js and generator.js never need touching.
 *
 * `files` paths are repo-relative; generator.js fetches them from the
 * real firmware/ tree at generation time so the configurator can never
 * drift from what's actually there.
 */

const BOARDS = {
    pro_mini: {
        id: "pro_mini",
        name: "Arduino Pro Mini (3.3V / 8MHz)",
        boardFiles: [
            "firmware/boards/pro_mini/board.h",
            "firmware/boards/pro_mini/board.cpp",
        ],
        platformioIni: "firmware/templates/platformio.ini.pro_mini",
        crsfInitCall: (baud) => `crsf_uart_init(CRSF_BAUD_${baud});`,
        baudOptions: [
            { value: 256000, label: "256000 (proven default)" },
            { value: 115200, label: "115200" },
        ],
        // 420000 is deliberately not offered: at 8MHz the nearest UBRR0
        // register value overshoots to ~500000 baud (~19% error), too
        // high to decode reliably. See project plan for details.
        reservedPins: ["D1 (CRSF TX)"],
    },
    esp32c3_zero: {
        id: "esp32c3_zero",
        name: "ESP32-C3 Zero",
        boardFiles: [
            "firmware/boards/esp32c3_zero/board.h",
            "firmware/boards/esp32c3_zero/board.cpp",
        ],
        platformioIni: "firmware/templates/platformio.ini.esp32c3_zero",
        crsfInitCall: (baud) => `crsf_uart_init(${baud});`,
        baudOptions: [
            { value: 420000, label: "420000 (default, closest to CRSF full-duplex spec)" },
            { value: 400000, label: "400000" },
            { value: 115200, label: "115200" },
            { value: 921600, label: "921600" },
        ],
        reservedPins: ["GPIO4 (CRSF TX)"],
    },
};

const SENSORS = {
    hall_3144e: {
        id: "hall_3144e",
        name: "3144E Hall Sensor Module",
        frame: "0x0C RPM",
        files: [
            "firmware/sensors/hall_3144e/hall_3144e.h",
            "firmware/sensors/hall_3144e/hall_3144e.cpp",
        ],
        include: "hall_3144e.h",
        initCall: "hall_3144e_init();",
        pollCall: "hall_3144e_poll_and_send();",
        pinsUsed: { pro_mini: ["D2"], esp32c3_zero: ["GPIO5"] },
        usesI2c: false,
    },
    gps_m100_5883: {
        id: "gps_m100_5883",
        name: "HGLRC M100-5883 (M10) GPS Module",
        frame: "0x02 GPS",
        files: [
            "firmware/sensors/gps_m100_5883/gps_m100_5883.h",
            "firmware/sensors/gps_m100_5883/gps_m100_5883.cpp",
        ],
        include: "gps_m100_5883.h",
        initCall: "gps_m100_5883_init();",
        pollCall: "gps_m100_5883_poll_and_send();",
        pinsUsed: { pro_mini: ["D8 (GPS RX)", "D9 (GPS TX)"], esp32c3_zero: ["GPIO20 (GPS RX)", "GPIO21 (GPS TX)"] },
        usesI2c: false,
    },
    ina226: {
        id: "ina226",
        name: "INA226 Current/Voltage Sensor",
        frame: "0x08 Battery Sensor",
        files: [
            "firmware/sensors/ina226/ina226.h",
            "firmware/sensors/ina226/ina226.cpp",
        ],
        include: "ina226.h",
        initCall: "ina226_init();",
        pollCall: "ina226_poll_and_send();",
        pinsUsed: { pro_mini: [], esp32c3_zero: [] }, // I2C bus is shared, not an exclusive-pin conflict
        usesI2c: true,
    },
    voltage_divider: {
        id: "voltage_divider",
        name: "Voltage Divider (plain)",
        frame: "0x0E Voltages",
        files: [
            "firmware/sensors/voltage_divider/voltage_divider.h",
            "firmware/sensors/voltage_divider/voltage_divider.cpp",
        ],
        include: "voltage_divider.h",
        initCall: "voltage_divider_init();",
        pollCall: "voltage_divider_poll_and_send();",
        pinsUsed: { pro_mini: ["A1"], esp32c3_zero: ["GPIO1"] },
        usesI2c: false,
    },
    mf58_ntc: {
        id: "mf58_ntc",
        name: "MF58 NTC Thermistor (voltage divider)",
        frame: "0x0D TEMP",
        files: [
            "firmware/sensors/mf58_ntc/mf58_ntc.h",
            "firmware/sensors/mf58_ntc/mf58_ntc.cpp",
        ],
        include: "mf58_ntc.h",
        initCall: "mf58_ntc_init();",
        pollCall: "mf58_ntc_poll_and_send();",
        pinsUsed: { pro_mini: ["A0"], esp32c3_zero: ["GPIO0"] },
        usesI2c: false,
    },
    bmp280: {
        id: "bmp280",
        name: "BMP280 Barometer",
        frame: "0x09 Barometric Altitude & Vertical Speed",
        files: [
            "firmware/sensors/bmp280/bmp280.h",
            "firmware/sensors/bmp280/bmp280.cpp",
        ],
        include: "bmp280.h",
        initCall: "bmp280_init();",
        pollCall: "bmp280_poll_and_send();",
        pinsUsed: { pro_mini: [], esp32c3_zero: [] }, // I2C bus is shared, not an exclusive-pin conflict
        usesI2c: true,
    },
};
