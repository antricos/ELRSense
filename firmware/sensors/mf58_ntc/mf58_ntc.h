/**
 * MF58 NTC thermistor via resistor voltage divider -> CRSF TEMP (0x0D).
 *
 * Assumed circuit: Vcc -- NTC -- ADC_PIN -- R_FIXED -- GND. Resistance is
 * derived from the ADC ratio (Vcc cancels out), then converted to
 * temperature via the Beta equation using the constants in mf58_ntc.h.
 * If your board wires the fixed resistor to Vcc and the NTC to GND
 * instead, flip the ratio in mf58_ntc.cpp's read_resistance_ohms().
 */
#pragma once

// Tune these to your actual divider/thermistor if they differ from a
// typical MF58 10K NTC with a 10K fixed resistor.
#define MF58_R_FIXED_OHMS   10000.0f
#define MF58_R_NOMINAL_OHMS 10000.0f  // NTC resistance at MF58_T_NOMINAL_C
#define MF58_T_NOMINAL_C    25.0f
#define MF58_BETA           3950.0f   // typical MF58 B-value

// CRSF TEMP source_id: 1 = Ambient (see crsf.md fixed source IDs; 0xEE/0xEC
// are reserved for TX/RX device temperature, not sensor modules like this).
#define MF58_TEMP_SOURCE_ID 1

void mf58_ntc_init();
void mf58_ntc_poll_and_send();
