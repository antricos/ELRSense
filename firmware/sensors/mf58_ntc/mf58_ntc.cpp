/**
 * This module includes "board.h" and "crsf.h" unqualified rather than by
 * relative path. The configurator's generator places whichever board's
 * board.h (and common/crsf.h) the user selected on the compiler include
 * path alongside this file, so the same sensor source works unmodified
 * against any supported board -- that's the whole point of the shared
 * init()/poll_and_send() module pattern (see project plan).
 */
#include "mf58_ntc.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>
#include <math.h>

static float read_resistance_ohms() {
    int raw = analogRead(PIN_MF58_NTC_ADC);
    if (raw <= 0) raw = 1; // guard divide-by-zero on a floating/disconnected pin
    return MF58_R_FIXED_OHMS * ((float)ADC_MAX_COUNTS / (float)raw - 1.0f);
}

static float resistance_to_celsius(float r_ohms) {
    float t0_kelvin = MF58_T_NOMINAL_C + 273.15f;
    float inv_t = 1.0f / t0_kelvin + (1.0f / MF58_BETA) * logf(r_ohms / MF58_R_NOMINAL_OHMS);
    return (1.0f / inv_t) - 273.15f;
}

void mf58_ntc_init() {
    // analogRead() needs no explicit pin mode on AVR or ESP32.
}

void mf58_ntc_poll_and_send() {
    float celsius = resistance_to_celsius(read_resistance_ohms());
    int16_t decideg_c = (int16_t)(celsius * 10.0f);

    uint8_t payload[3];
    uint8_t len = crsf_pack_temp(payload, MF58_TEMP_SOURCE_ID, decideg_c);
    crsf_send_frame(CRSF_FRAMETYPE_TEMP, payload, len);
}
