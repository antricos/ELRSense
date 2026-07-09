/**
 * 3144E Hall-effect sensor, interrupt pulse-counting -> CRSF RPM (0x0C).
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
