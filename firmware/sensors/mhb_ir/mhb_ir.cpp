#include "mhb_ir.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>

static volatile uint32_t pulse_count = 0;
static uint32_t last_poll_ms = 0;

static void on_pulse() {
    pulse_count++;
}

void mhb_ir_init() {
    pinMode(PIN_MHB_IR, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_MHB_IR), on_pulse, FALLING);
    last_poll_ms = millis();
}

void mhb_ir_poll_and_send() {
    uint32_t now = millis();
    uint32_t elapsed_ms = now - last_poll_ms;
    if (elapsed_ms == 0) elapsed_ms = 1; // guard divide-by-zero if polled twice in the same ms
    last_poll_ms = now;

    noInterrupts();
    uint32_t pulses = pulse_count;
    pulse_count = 0;
    interrupts();

    float revs = (float)pulses / (float)MHB_IR_PULSES_PER_REV;
    float rpm = revs * 60000.0f / (float)elapsed_ms;

    uint8_t payload[4];
    uint8_t len = crsf_pack_rpm(payload, MHB_IR_RPM_SOURCE_ID, (int32_t)rpm);
    crsf_send_frame(CRSF_FRAMETYPE_RPM, payload, len);
}
