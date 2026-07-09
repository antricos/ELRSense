/**
 * Board pin map + CRSF UART setup for ESP32-C3 Zero.
 *
 * CRSF TX uses a dedicated HardwareSerial (UART1) so it never contends
 * with USB-CDC or a GPS module. GPS (if selected) uses the default
 * hardware UART0 (Serial) pins instead of SoftwareSerial, since the C3
 * has enough UART controllers to give each its own -- unlike the Pro Mini.
 */
#pragma once

#include <stdint.h>
#include <Arduino.h>
#include <Wire.h>

// --- Pin map -------------------------------------------------------------
#define PIN_HALL_3144E        5
#define PIN_MF58_NTC_ADC      0   // ADC1_CH0
#define PIN_VOLTAGE_DIV_ADC   1   // ADC1_CH1
#define PIN_I2C_SDA           8   // INA226 / BMP280
#define PIN_I2C_SCL           9
#define PIN_CRSF_TX           4   // Serial1 TX; board is TX-only, RX unused

// I2C_INIT() lets INA226/BMP280 share one board-agnostic call: the C3
// needs explicit SDA/SCL pins passed to Wire.begin(), unlike AVR's fixed
// hardware TWI pins.
#define I2C_INIT() Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL)
// GPS uses the default hardware UART0 (Serial) pins: RX=GPIO20, TX=GPIO21.

// ESP32-C3 ADC defaults to 12-bit. Its response is known to be non-linear
// near the rail extremes; the ratio-based NTC/divider math here assumes
// linearity, which is a fair approximation away from the extremes but a
// known limitation worth re-checking against a multimeter on real hardware.
#define ADC_MAX_COUNTS 4095

// GPS UART: the C3 has enough UART controllers to give GPS its own
// hardware UART (default Serial/UART0 pins) instead of SoftwareSerial.
// Sensor modules use GpsSerial without caring whether it's Software- or
// HardwareSerial underneath.
#define GpsSerial Serial

// --- CRSF UART (HardwareSerial, runtime-selectable baud) ------------------
void crsf_uart_init(uint32_t baud);
// crsf_write_byte(uint8_t) is declared in common/crsf.h and defined in board.cpp.
