#include "hall_ky003.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>

static volatile uint32_t pulse_count = 0;
static uint32_t last_poll_ms = 0;

static void on_pulse() {
    pulse_count++;
}

void hall_ky003_init() {
    pinMode(PIN_HALL_KY003, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_HALL_KY003), on_pulse, FALLING);
    last_poll_ms = millis();
}

void hall_ky003_poll_and_send() {
    uint32_t now = millis();
    uint32_t elapsed_ms = now - last_poll_ms;
    if (elapsed_ms == 0) elapsed_ms = 1; // guard divide-by-zero if polled twice in the same ms
    last_poll_ms = now;

    noInterrupts();
    uint32_t pulses = pulse_count;
    pulse_count = 0;
    interrupts();

    float revs = (float)pulses / (float)KY003_PULSES_PER_REV;
    float rpm = revs * 60000.0f / (float)elapsed_ms;

    uint8_t payload[4];
    uint8_t len = crsf_pack_rpm(payload, KY003_RPM_SOURCE_ID, (int32_t)rpm);
    crsf_send_frame(CRSF_FRAMETYPE_RPM, payload, len);
}
