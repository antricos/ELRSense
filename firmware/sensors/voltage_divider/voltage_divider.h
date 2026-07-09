/**
 * Plain resistor voltage divider -> CRSF Voltages (0x0E).
 *
 * Circuit: Vbatt -- R_TOP -- ADC_PIN -- R_BOTTOM -- GND.
 */
#pragma once
#include <stdint.h>

#define VDIV_R_TOP_OHMS    100000.0f
#define VDIV_R_BOTTOM_OHMS 10000.0f
#define VDIV_VREF_MV       3300.0f  // ADC reference voltage in millivolts

// 128..255 = general voltage from a single source, per crsf.md 0x0E.
#define VDIV_VOLTAGE_SOURCE_ID 128

void voltage_divider_init();
void voltage_divider_poll_and_send();
