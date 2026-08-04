/**
 * KY-003 Hall-effect sensor module -- a bare A3144E/3144E digital Hall
 * switch on a 3-pin (VCC/GND/DO) breakout, no onboard comparator or
 * sensitivity trimmer. Interrupt pulse-counting -> CRSF RPM (0x0C), same
 * approach as hall_3144e.cpp (see that file for why: electrically this
 * module's open-drain digital output is indistinguishable from the
 * LM393+3144 speed-sensor board's, so the same driver logic applies).
 */
#pragma once
#include <stdint.h>

// Number of magnet passes per shaft revolution; adjust to your setup
// (e.g. a single magnet on a prop shaft = 1, a 14-pole motor read at the
// bell = 7 poles/rev depending on wiring).
//
// Named KY003_* rather than reusing hall_3144e.h's HALL_* names: both
// sensors can be added to the same board at once (uncapped, same 0x0C RPM
// frame), and generator.js's per-instance suffix is scoped to each
// sensor's own instance array, not globally unique -- two catalog entries
// sharing a literal macro name would produce identically-named #defines
// at the same instance index, silently colliding.
#define KY003_PULSES_PER_REV 1

// 0 = Motor 1, per the crsf.md RPM frame example source-id convention.
#define KY003_RPM_SOURCE_ID 0

void hall_ky003_init();
void hall_ky003_poll_and_send();
