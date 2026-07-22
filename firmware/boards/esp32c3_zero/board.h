/**
 * Board pin map + CRSF UART setup for ESP32-C3 Zero.
 *
 * CRSF uses the board's fixed hardware UART0 pins (GPIO20 RX / GPIO21 TX,
 * per the board's silkscreen/pinout diagram) via a HardwareSerial bound to
 * UART controller 0 -- not the `Serial` global, which on this chip is the
 * native USB-CDC virtual port, not real UART0. GPS (if selected) uses
 * UART1 instead, with its RX pin picked per instance by the configurator;
 * its TX is left unconnected (module RX is never written to).
 */
#pragma once

#include <stdint.h>
#include <Arduino.h>
#include <Wire.h>

// --- Pin map -------------------------------------------------------------
// Per-GPIO sensors (hall/thermistor/voltage-divider/GPS) get their pin
// picked per instance by the configurator, not fixed here -- see
// catalog.js's pinPool/instanceSymbols. Only the fixed, board-wide pins
// live here.
#define PIN_I2C_SDA           8    // INA226 / BMP280
#define PIN_I2C_SCL           9
#define PIN_CRSF_RX           20   // UART0 RX
#define PIN_CRSF_TX           21   // UART0 TX

// I2C_INIT() lets INA226/BMP280 share one board-agnostic call: the C3
// needs explicit SDA/SCL pins passed to Wire.begin(), unlike AVR's fixed
// hardware TWI pins.
#define I2C_INIT() Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL)

// ESP32-C3 ADC defaults to 12-bit. Its response is known to be non-linear
// near the rail extremes; the ratio-based NTC/divider math here assumes
// linearity, which is a fair approximation away from the extremes but a
// known limitation worth re-checking against a multimeter on real hardware.
#define ADC_MAX_COUNTS 4095

// GPS_SERIAL_BEGIN() lets gps_m100_5883.cpp start GpsSerial without knowing
// whether the board backs it with a HardwareSerial (as here) or a
// SoftwareSerial -- their begin() signatures differ, so each board defines
// this macro to match its own type.
#define GPS_SERIAL_BEGIN() GpsSerial.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, -1)

// GPS UART: real HardwareSerial on UART1 (not a SoftwareSerial or Serial
// alias), so sensor modules can just call GpsSerial.begin()/available()/
// read() without knowing which physical UART backs it.
extern HardwareSerial GpsSerial;

// --- CRSF UART (HardwareSerial on UART0, runtime-selectable baud) --------
void crsf_uart_init(uint32_t baud);
// crsf_write_byte(uint8_t) is declared in common/crsf.h and defined in board.cpp.
