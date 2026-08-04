/**
 * Board pin map + CRSF UART setup for Arduino Pro Mini (3.3V / 8MHz,
 * ATmega328P).
 *
 * CRSF uses the board's one hardware UART (D0 RX / D1 TX, the same pins
 * used to program the board) via the `Serial` global -- this project is
 * TX-only (see common/crsf.h), so D0/RX is never actually driven, but it's
 * still reserved in the configurator since it's physically shared with the
 * TX line during upload. GPS (if selected) uses a SoftwareSerial on its
 * per-instance RX pin instead, since there's no second hardware UART free;
 * its TX is left unconnected (module RX is never written to).
 */
#pragma once

#include <stdint.h>
#include <Arduino.h>
#include <Wire.h>
#include <SoftwareSerial.h>

// --- Pin map -------------------------------------------------------------
// Per-GPIO sensors (hall/thermistor/voltage-divider/GPS) get their pin
// picked per instance by the configurator, not fixed here -- see
// catalog.js's pinPool/instanceSymbols. Only the fixed, board-wide pins
// live here. Numbering matches the Arduino core's own digital pin IDs
// (A0-A5 = 14-19), the same IDs pinMode()/digitalRead() use.
#define PIN_I2C_SDA           18   // A4
#define PIN_I2C_SCL           19   // A5
#define PIN_CRSF_RX           0    // UART0 RX (unused, TX-only)
#define PIN_CRSF_TX           1    // UART0 TX

// I2C_INIT() lets INA226/BMP280/MPU6050 share one board-agnostic call: AVR's
// hardware TWI pins are fixed, so Wire.begin() takes no pin arguments here
// (unlike the ESP32-C3, which needs explicit SDA/SCL pins passed in).
#define I2C_INIT() Wire.begin()

// 328P's ADC is 10-bit, unlike the ESP32-C3's 12-bit.
#define ADC_MAX_COUNTS 1023

// GPS_SERIAL_BEGIN() lets a GPS sensor module start GpsSerial without knowing
// whether the board backs it with a HardwareSerial or (as here) a
// SoftwareSerial -- their begin() signatures differ, so each board defines
// this macro to match its own type.
#define GPS_SERIAL_BEGIN() GpsSerial.begin(GPS_BAUD)

// GPS UART: no second hardware UART on the 328P, so this is a SoftwareSerial
// constructed directly on the configurator-picked RX pin (see board.cpp).
extern SoftwareSerial GpsSerial;

// --- CRSF UART (hardware Serial on UART0, runtime-selectable baud) -------
void crsf_uart_init(uint32_t baud);
// crsf_write_byte(uint8_t) is declared in common/crsf.h and defined in board.cpp.
