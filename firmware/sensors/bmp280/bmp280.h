/**
 * BMP280 barometer, direct register access + Bosch compensation formulas
 * -> CRSF Barometric Altitude & Vertical Speed (0x09).
 *
 * The first successful reading after init becomes the zero-altitude
 * reference point (CRSF wants altitude "above start/calibration point"),
 * so power the board up before takeoff, not mid-flight.
 */
#pragma once
#include <stdint.h>

#define BMP280_I2C_ADDR 0x76 // 0x77 if the module's SDO pin is pulled high

void bmp280_init();
void bmp280_poll_and_send();
