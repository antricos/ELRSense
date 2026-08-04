/**
 * MH-B IR reflective sensor module (LM393-conditioned IR emitter/receiver
 * pair, sold as an "obstacle avoidance"/line-follower module) used as an
 * optical tachometer: tape one non-reflective stripe onto an otherwise
 * reflective wheel/shaft/disc and the module pulses once per stripe
 * crossing. Interrupt pulse-counting -> CRSF RPM (0x0C), same approach as
 * hall_3144e.cpp/hall_ky003.cpp -- electrically this module's active-low
 * digital output is indistinguishable from either Hall board's, only the
 * sensing mechanism (reflected IR vs magnetic field) differs.
 *
 * Named MHB_IR_* rather than reusing the Hall sensors' macro names: all
 * three can be added to the same board at once (uncapped, same 0x0C RPM
 * frame), and generator.js's per-instance suffix is scoped to each
 * sensor's own instance array, not globally unique, so reusing another
 * sensor's literal macro name would let two different sensors' same-index
 * instances collide on one #define (see CLAUDE.md's hall_ky003 note for
 * how this bit us the first time).
 */
#pragma once
#include <stdint.h>

// Number of stripe/mark crossings per shaft revolution; adjust to your
// target (a single stripe on a wheel = 1, a multi-segment encoder disc =
// however many non-reflective segments it has).
#define MHB_IR_PULSES_PER_REV 1

// 0 = Motor 1, per the crsf.md RPM frame example source-id convention.
#define MHB_IR_RPM_SOURCE_ID 0

void mhb_ir_init();
void mhb_ir_poll_and_send();
