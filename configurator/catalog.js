/**
 * Single source of truth for board + sensor metadata. Adding a sensor
 * means adding one entry here (plus its firmware/ source files) -- app.js
 * and generator.js never need touching.
 *
 * `files` paths are repo-relative; generator.js fetches them from the
 * real firmware/ tree at generation time so the configurator can never
 * drift from what's actually there.
 *
 * `configDefines` names the exact #define macros (as they appear in the
 * real firmware/ headers) that the generator pulls into the "USER
 * CONFIGURATION" block at the top of the generated .ino -- single source
 * of truth stays in firmware/, the generator just relocates the literal
 * lines, it doesn't invent values.
 *
 * Every sensor uses the same "+ Add" UI (see app.js); `maxInstances`
 * caps how many can be added (default unlimited if omitted). Sensors with
 * `pinRole` set (hall_3144e/mf58_ntc/voltage_divider/gps_m100_5883) get a
 * per-instance pin picker; ina226/bmp280 have no `pinRole` -- they share a
 * fixed I2C bus, so "+ Add" just adds/removes the sensor, no pin to pick.
 *
 * `maxInstances: 1` on gps_m100_5883/ina226/bmp280 isn't a UI nicety --
 * their CRSF frame types (0x02, 0x08, 0x09) have no `source_id` field, so
 * a second instance would silently overwrite the first's reading with no
 * way for the receiver to tell them apart. hall_3144e/mf58_ntc/
 * voltage_divider's frames (0x0C, 0x0D, 0x0E) all carry a source_id, so
 * they're uncapped.
 */

const BOARDS = {
    esp32c3_zero: {
        id: "esp32c3_zero",
        name: "ESP32-C3 Zero",
        pinoutImage: "recources/esp32-c3-zero-pinout.jpg",
        boardFiles: [
            "firmware/boards/esp32c3_zero/board.h",
            "firmware/boards/esp32c3_zero/board.cpp",
        ],
        // GPIOs available for per-instance sensor pin mapping. "adc" pins
        // are the subset of "digital" that also support analogRead().
        // Source: recources/esp32-c3-zero-pinout.jpg (GP0-GP4 carry the
        // ADC1 label; GP5-GP10 don't). GPIO4 is free for ADC use now that
        // CRSF lives on the fixed UART0 pins (20/21) instead.
        pinPool: {
            adc: [0, 1, 2, 3, 4],
            digital: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            // Any GPIO supports attachInterrupt() on this chip, so this
            // mirrors `digital` -- unlike the Pro Mini, which restricts
            // interrupts to two fixed pins (see pro_mini's pinPool below).
            interrupt: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
        // Pins never offered in the picker -- shown for information only,
        // since they're outside pinPool's 0-10 range anyway.
        reservedPins: { 20: "CRSF RX", 21: "CRSF TX" },
        // Pins only reserved when an I2C sensor (ina226/bmp280) is selected.
        i2cPins: { 8: "I2C SDA", 9: "I2C SCL" },
        // Offered, but flagged -- shared with the board's onboard WS2812 LED.
        cautionPins: { 10: "onboard WS2812 LED" },
        // Percentage position (of the pinoutImage's own width/height) of
        // each pin's header hole, hand-calibrated against
        // recources/esp32-c3-zero-pinout.jpg -- used to overlay live
        // claimed/reserved markers on the diagram in the configurator.
        pinCoords: {
            0: [43.3, 43.1], 1: [43.3, 45.9], 2: [43.3, 48.6], 3: [43.3, 51.3], 4: [43.3, 54.0], 5: [43.3, 56.7],
            6: [61.4, 56.7], 7: [61.4, 54.0], 8: [61.4, 51.3], 9: [61.4, 48.6], 10: [61.4, 45.9],
            20: [61.4, 37.7], 21: [61.4, 35.0],
        },
        // Board-wide (non-per-instance) pins always/conditionally needed.
        pinDefines: {
            order: ["PIN_I2C_SDA", "PIN_I2C_SCL", "PIN_CRSF_RX", "PIN_CRSF_TX"],
            always: ["PIN_CRSF_RX", "PIN_CRSF_TX"],
            perSensor: {
                ina226: ["PIN_I2C_SDA", "PIN_I2C_SCL"],
                bmp280: ["PIN_I2C_SDA", "PIN_I2C_SCL"],
            },
        },
        crsfInitCall: "crsf_uart_init(CRSF_BAUD_RATE);",
        // Baud rates supported by ExpressLRS's CRSF telemetry link, fastest
        // to slowest. 420000 is the recommended default (closest to the
        // CRSF full-duplex spec's 400 kbaud default with clean UART timing).
        baudOptions: [
            { value: 921600, label: "921600" },
            { value: 420000, label: "420000 (recommended)", default: true },
            { value: 400000, label: "400000" },
            { value: 115200, label: "115200" },
        ],
        arduinoIde: {
            boardMenu: "Tools > Board > esp32 > ESP32C3 Dev Module",
            extraSetup: "Requires the \"esp32\" board package by Espressif Systems: File > Preferences > Additional Boards Manager URLs, add " +
                "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json , then Tools > Board > Boards Manager, search \"esp32\", install.",
        },
    },
    pro_mini: {
        id: "pro_mini",
        name: "Arduino Pro Mini (3.3V/8MHz)",
        pinoutImage: "recources/Arduino_Pro_Mini_Pinout.jpg",
        boardFiles: [
            "firmware/boards/pro_mini/board.h",
            "firmware/boards/pro_mini/board.cpp",
        ],
        // Pin numbering matches the Arduino AVR core's own digital pin IDs
        // (the same IDs PIN_* #defines and pinMode()/digitalRead() use), per
        // recources/Arduino_Pro_Mini_Pinout.jpg: D0-D13 are digital pins,
        // A0-A5 double as D14-D19, and A6/A7 are analog-only (no PCx port,
        // no digitalRead()/pinMode() support) but still usable with
        // analogRead() via the core's A6=20/A7=21 macros. Those two numbers
        // don't appear on the physical pinout diagram -- they're internal
        // IDs from the "Arduino Pro or Pro Mini" board's pins_arduino.h
        // (the "eightanaloginputs" variant), not silkscreen labels, so
        // `pinNames` below maps every number back to what's actually
        // printed on the board/diagram for display in the UI.
        pinPool: {
            adc: [14, 15, 16, 17, 20, 21], // A0-A3, A6, A7 (A4/A5 reserved for I2C, see i2cPins)
            digital: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
            // attachInterrupt() only works on D2/D3 (INT0/INT1) on the
            // 328P, unlike the ESP32-C3 where any GPIO qualifies -- see
            // hall_3144e's pinRole.
            interrupt: [2, 3],
        },
        // Silkscreen/diagram labels for every pin number used above --
        // app.js falls back to "GPIOn" (the ESP32-C3's native naming) when
        // a board has no pinNames map, but AVR boards are conventionally
        // labeled D0-D13/A0-A7, not GPIOn, and A6/A7's raw numbers (20/21)
        // don't appear on the board at all (see the pinPool comment above).
        pinNames: {
            0: "D0", 1: "D1", 2: "D2", 3: "D3", 4: "D4", 5: "D5", 6: "D6", 7: "D7",
            8: "D8", 9: "D9", 10: "D10", 11: "D11", 12: "D12", 13: "D13",
            14: "A0", 15: "A1", 16: "A2", 17: "A3", 18: "A4", 19: "A5", 20: "A6", 21: "A7",
        },
        // Pins never offered in the picker -- D0/RX is physically shared
        // with the upload/CRSF TX line even though this project never reads
        // from it (TX-only, see common/crsf.h).
        reservedPins: { 0: "CRSF RX (unused, reserved)", 1: "CRSF TX" },
        // Pins only reserved when an I2C sensor (ina226/bmp280) is selected.
        i2cPins: { 18: "I2C SDA", 19: "I2C SCL" },
        // Offered, but flagged -- shared with the board's onboard LED.
        cautionPins: { 13: "onboard LED" },
        // Percentage position (of the pinoutImage's own width/height) of
        // each pin's header hole, hand-calibrated against
        // recources/Arduino_Pro_Mini_Pinout.jpg -- used to overlay live
        // claimed/reserved markers on the diagram in the configurator. A4-A7
        // have no header-hole graphic in this diagram (drawn as a separate
        // label block below the board), so those four point at that label
        // box instead of a hole.
        pinCoords: {
            0: [39.6, 30.2], 1: [39.6, 27.8],
            2: [39.6, 37.2], 3: [39.6, 39.4], 4: [39.6, 41.7], 5: [39.6, 44.0],
            6: [39.6, 46.2], 7: [39.6, 48.7], 8: [39.6, 50.9], 9: [39.6, 53.2],
            10: [53.2, 53.2], 11: [53.2, 50.9], 12: [53.2, 48.7], 13: [53.2, 46.2],
            14: [53.2, 44.0], 15: [53.2, 41.7], 16: [53.2, 39.4], 17: [53.2, 37.2],
            18: [48.8, 59.9], 19: [48.8, 57.6], 20: [48.8, 66.7], 21: [48.8, 64.4],
        },
        // Board-wide (non-per-instance) pins always/conditionally needed.
        pinDefines: {
            order: ["PIN_I2C_SDA", "PIN_I2C_SCL", "PIN_CRSF_RX", "PIN_CRSF_TX"],
            always: ["PIN_CRSF_RX", "PIN_CRSF_TX"],
            perSensor: {
                ina226: ["PIN_I2C_SDA", "PIN_I2C_SCL"],
                bmp280: ["PIN_I2C_SDA", "PIN_I2C_SCL"],
            },
        },
        crsfInitCall: "crsf_uart_init(CRSF_BAUD_RATE);",
        // At 8MHz the AVR UART can't hit the CRSF-standard ~416666 baud
        // accurately (best case ~20% error). 256000 resolves to the same
        // UBRR/U2X registers (actual ~250000 baud) as the reference Pro
        // Mini sketch's manual register setup (reference/pro-mini-crsf-temp),
        // so it reproduces already-validated real-hardware behavior. The
        // rest are either exact at this clock (250000/200000/125000) or a
        // widely-supported CRSF compatibility rate (115200). Listed fastest
        // to slowest, matching esp32c3_zero's baudOptions order.
        baudOptions: [
            { value: 256000, label: "256000 (recommended)", default: true },
            { value: 250000, label: "250000" },
            { value: 200000, label: "200000" },
            { value: 125000, label: "125000" },
            { value: 115200, label: "115200" },
        ],
        arduinoIde: {
            boardMenu: "Tools > Board > Arduino AVR Boards > Arduino Pro or Pro Mini, then Tools > Processor > ATmega328P (3.3V, 8MHz)",
            extraSetup: null,
        },
    },
};

// Sections the sensor list is rendered under, grouped by CRSF frame type
// (each sensor's own `frame` field is the group id -- see crsf.md for what
// each frame carries). Order here is display order.
const SENSOR_GROUPS = [
    { id: "0x08 Battery Sensor" },
    { id: "0x09 Barometric Altitude & Vertical Speed" },
    { id: "0x0E Voltages" },
    { id: "0x0D Temperature" },
    { id: "0x0C RPM" },
    { id: "0x02 GPS" },
].map((g) => ({ ...g, label: g.id }));

function sensorGroupId(sensor) {
    return sensor.frame;
}

const SENSORS = {
    hall_3144e: {
        id: "hall_3144e",
        name: "3144E Hall Sensor Module",
        icon: "⚙️",
        frame: "0x0C RPM",
        files: [
            "firmware/sensors/hall_3144e/hall_3144e.h",
            "firmware/sensors/hall_3144e/hall_3144e.cpp",
        ],
        usesI2c: false,
        pinRole: "interrupt", // pulse-count interrupt input, no ADC needed
        sourceIdBase: 0, // RPM source_id: 0 = Motor 1, 1 = Motor 2, ... (crsf.md)
        pinDefine: "PIN_HALL_3144E",
        sourceIdDefine: "HALL_RPM_SOURCE_ID",
        initCall: (i) => `hall_3144e_init_${i}();`,
        pollCall: (i) => `hall_3144e_poll_and_send_${i}();`,
        configDefines: ["HALL_PULSES_PER_REV"],
        instanceSymbols: [
            "hall_3144e_init", "hall_3144e_poll_and_send",
            "PIN_HALL_3144E", "HALL_RPM_SOURCE_ID", "HALL_PULSES_PER_REV",
        ],
    },
    gps_m100_5883: {
        id: "gps_m100_5883",
        name: "HGLRC M100-5883 (M10) GPS Module",
        icon: "🛰️",
        frame: "0x02 GPS",
        files: [
            "firmware/sensors/gps_m100_5883/gps_m100_5883.h",
            "firmware/sensors/gps_m100_5883/gps_m100_5883.cpp",
        ],
        usesI2c: false,
        maxInstances: 1, // 0x02 GPS frame has no source_id -- one only
        pinRole: "digital", // RX pin on UART1; TX is left disconnected
        pinDefine: "PIN_GPS_RX",
        sourceIdDefine: null, // no source_id field in this frame type
        initCall: (i) => `gps_m100_5883_init_${i}();`,
        pollCall: (i) => `gps_m100_5883_poll_and_send_${i}();`,
        configDefines: ["GPS_BAUD"],
        // Exposed as a per-instance number input in the UI (see
        // voltage_divider/mf58_ntc above) -- the NMEA baud rate the
        // attached GPS module actually talks, in case it's not a u-blox
        // M10 at its 9600 default. No `scale`: the field's value is the
        // #define's value directly.
        configFields: [
            { key: "GPS_BAUD", label: "Baud rate", default: 9600 },
        ],
        instanceSymbols: [
            "gps_m100_5883_init", "gps_m100_5883_poll_and_send",
            "PIN_GPS_RX", "GPS_BAUD",
        ],
    },
    ina226: {
        id: "ina226",
        name: "INA226 Current/Voltage Sensor",
        icon: "🔋",
        frame: "0x08 Battery Sensor",
        files: [
            "firmware/sensors/ina226/ina226.h",
            "firmware/sensors/ina226/ina226.cpp",
        ],
        initCall: "ina226_init();",
        pollCall: "ina226_poll_and_send();",
        usesI2c: true,
        maxInstances: 1, // 0x08 Battery frame has no source_id -- one only
        // No fixed pin text here -- app.js synthesizes it per selected
        // board from BOARD.i2cPins (this note would go stale otherwise:
        // the I2C bus is on different pins per board).
        configDefines: ["INA226_I2C_ADDR", "INA226_SHUNT_OHMS", "INA226_MAX_CURRENT_A", "INA226_BATTERY_CAPACITY_MAH"],
    },
    voltage_divider: {
        id: "voltage_divider",
        name: "Voltage Divider (plain)",
        icon: "⚡",
        wiringImage: "recources/Voltage Divider (plain).jpg",
        frame: "0x0E Voltages",
        files: [
            "firmware/sensors/voltage_divider/voltage_divider.h",
            "firmware/sensors/voltage_divider/voltage_divider.cpp",
        ],
        usesI2c: false,
        usesAdc: true,
        pinRole: "adc",
        sourceIdBase: 128, // Voltages source_id: 128..255 = general voltage from a single source (crsf.md)
        pinDefine: "PIN_VOLTAGE_DIV_ADC",
        sourceIdDefine: "VDIV_VOLTAGE_SOURCE_ID",
        initCall: (i) => `voltage_divider_init_${i}();`,
        pollCall: (i) => `voltage_divider_poll_and_send_${i}();`,
        configDefines: ["VDIV_R_TOP_OHMS", "VDIV_R_BOTTOM_OHMS", "VDIV_VREF_MV"],
        // Subset of configDefines exposed as a per-instance number input in
        // the UI (rather than only being editable by hand in the generated
        // .ino) -- the resistor values the user actually wired up. Entered
        // in kΩ for readability; `scale` is the multiplier generator.js
        // applies to get back to the ohm value the #define actually wants.
        configFields: [
            { key: "VDIV_R_TOP_OHMS", label: "R_TOP", unit: "kΩ", scale: 1000, default: 100 },
            { key: "VDIV_R_BOTTOM_OHMS", label: "R_BOTTOM", unit: "kΩ", scale: 1000, default: 10 },
        ],
        // Drives a derived "max measurable voltage" field in the UI:
        // Vmax = vrefMv/1000 * (R_TOP + R_BOTTOM) / R_BOTTOM. Editing that
        // field proposes a new R_TOP (topKey) with R_BOTTOM (bottomKey)
        // held fixed. vrefMv mirrors VDIV_VREF_MV's firmware default (not
        // itself a configField, so it's assumed fixed at 3.3V for this).
        voltageRange: {
            label: "Max voltage",
            unit: "V",
            vrefMv: 3300,
            topKey: "VDIV_R_TOP_OHMS",
            bottomKey: "VDIV_R_BOTTOM_OHMS",
        },
        instanceSymbols: [
            "voltage_divider_init", "voltage_divider_poll_and_send",
            "PIN_VOLTAGE_DIV_ADC", "VDIV_VOLTAGE_SOURCE_ID",
            "VDIV_R_TOP_OHMS", "VDIV_R_BOTTOM_OHMS", "VDIV_VREF_MV",
        ],
    },
    mf58_ntc: {
        id: "mf58_ntc",
        name: "MF58 NTC Thermistor (voltage divider)",
        icon: "🌡️",
        wiringImage: "recources/MF58 NTC Thermistor (voltage divider).jpg",
        frame: "0x0D Temperature",
        files: [
            "firmware/sensors/mf58_ntc/mf58_ntc.h",
            "firmware/sensors/mf58_ntc/mf58_ntc.cpp",
        ],
        usesI2c: false,
        usesAdc: true,
        pinRole: "adc",
        sourceIdBase: 1, // TEMP source_id: 0 = FC (reserved), 1 = Ambient, 2.. = additional sensors (crsf.md)
        pinDefine: "PIN_MF58_NTC_ADC",
        sourceIdDefine: "MF58_TEMP_SOURCE_ID",
        initCall: (i) => `mf58_ntc_init_${i}();`,
        pollCall: (i) => `mf58_ntc_poll_and_send_${i}();`,
        configDefines: ["MF58_R_FIXED_OHMS", "MF58_R_NOMINAL_OHMS", "MF58_T_NOMINAL_C", "MF58_BETA"],
        // Resistor + thermistor nominal values the user actually wired up,
        // exposed as a per-instance number input (see configFields above).
        // Entered in kΩ; `scale` converts back to ohms for the #define.
        configFields: [
            { key: "MF58_R_FIXED_OHMS", label: "R_FIXED", unit: "kΩ", scale: 1000, default: 10 },
            { key: "MF58_R_NOMINAL_OHMS", label: "NTC nominal @25°C", unit: "kΩ", scale: 1000, default: 10 },
        ],
        instanceSymbols: [
            "mf58_ntc_init", "mf58_ntc_poll_and_send",
            "PIN_MF58_NTC_ADC", "MF58_TEMP_SOURCE_ID",
            "MF58_R_FIXED_OHMS", "MF58_R_NOMINAL_OHMS", "MF58_T_NOMINAL_C", "MF58_BETA",
        ],
    },
    bmp280: {
        id: "bmp280",
        name: "BMP280 Barometer",
        icon: "⛰️",
        frame: "0x09 Barometric Altitude & Vertical Speed",
        files: [
            "firmware/sensors/bmp280/bmp280.h",
            "firmware/sensors/bmp280/bmp280.cpp",
        ],
        initCall: "bmp280_init();",
        pollCall: "bmp280_poll_and_send();",
        usesI2c: true,
        maxInstances: 1, // 0x09 Baro frame has no source_id -- one only
        // No fixed pin text here -- app.js synthesizes it per selected
        // board from BOARD.i2cPins (this note would go stale otherwise:
        // the I2C bus is on different pins per board).
        configDefines: ["BMP280_I2C_ADDR"],
    },
};
