/**
 * LM393 + 3144E Hall speed sensor module (LM393 comparator with an onboard
 * sensitivity trimmer conditioning the bare 3144E's output -- the common
 * "Hall Sensor Motor Speed Measurement Module" bundled in robot-car kits).
 * Interrupt pulse-counting -> CRSF RPM (0x0C). See hall_ky003.cpp for the
 * bare-chip module this shares its driver logic with.
 */
#pragma once
#include <stdint.h>

// Number of magnet passes per shaft revolution; adjust to your setup
// (e.g. a single magnet on a prop shaft = 1, a 14-pole motor read at the
// bell = 7 poles/rev depending on wiring).
#define HALL_PULSES_PER_REV 1

// 0 = Motor 1, per the crsf.md RPM frame example source-id convention.
#define HALL_RPM_SOURCE_ID 0

void hall_3144e_init();
void hall_3144e_poll_and_send();
