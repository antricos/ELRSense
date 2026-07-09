/**
 * INA226 current/voltage sensor, direct register access -> CRSF Battery
 * Sensor (0x08). capacity_used/remaining% are computed in firmware by
 * integrating current over time (the INA226 itself has no coulomb
 * counter), so BATTERY_CAPACITY_MAH must match your actual pack for the
 * remaining% figure to mean anything.
 */
#pragma once
#include <stdint.h>

#define INA226_I2C_ADDR      0x40   // default address (A0/A1 tied low)
#define INA226_SHUNT_OHMS    0.002f // adjust to your board's shunt resistor
#define INA226_MAX_CURRENT_A 100.0f // adjust to your expected max current
#define INA226_BATTERY_CAPACITY_MAH 5000.0f // adjust to your pack's rated capacity

void ina226_init();
void ina226_poll_and_send();
