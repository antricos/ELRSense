/**
 * Board pin map + CRSF UART setup for Arduino Pro Mini (3.3V / 8MHz).
 *
 * The Pro Mini has exactly one hardware UART, and it's dedicated to CRSF
 * TX-only telemetry output (raw AVR register init, no Serial.begin()) --
 * same approach proven in reference/pro-mini-crsf-temp. A sensor needing
 * its own UART (GPS) must use SoftwareSerial on spare pins instead.
 */
#pragma once

#include <stdint.h>
#include <Arduino.h>
#include <SoftwareSerial.h>
#include <Wire.h>

// --- Pin map -------------------------------------------------------------
#define PIN_HALL_3144E       2   // INT0, pulse-count RPM input
#define PIN_MF58_NTC_ADC      A0
#define PIN_VOLTAGE_DIV_ADC   A1
// INA226/BMP280 use the hardware TWI pins (A4=SDA, A5=SCL) via Wire.h --
// fixed in hardware on AVR, so I2C_INIT() takes no pin arguments here.
#define I2C_INIT() Wire.begin()
#define PIN_GPS_RX            8  // SoftwareSerial RX, wired to GPS module TX
#define PIN_GPS_TX            9  // SoftwareSerial TX pin (required by the library; GPS module RX is left unconnected since this board never sends to the GPS)

// ATmega328P ADC is 10-bit.
#define ADC_MAX_COUNTS 1023

// GPS UART: SoftwareSerial, since the Pro Mini's one hardware UART is
// dedicated to CRSF. Sensor modules use GpsSerial without caring whether
// it's Software- or HardwareSerial underneath.
extern SoftwareSerial GpsSerial;

// --- CRSF UART (hardware UART0 TX, raw register init) --------------------
// Baud choices are limited to rates with acceptable timing error at 8MHz.
// 420000 is intentionally not offered here: at 8MHz the nearest UBRR0
// register value undershoots to ~500000 baud (~19% error), too high to
// decode reliably. See project plan for the per-rate error analysis.
typedef enum {
    CRSF_BAUD_115200 = 115200,
    CRSF_BAUD_256000 = 256000,
} crsf_baud_t;

void crsf_uart_init(crsf_baud_t baud);
// crsf_write_byte(uint8_t) is declared in common/crsf.h and defined in board.cpp.
