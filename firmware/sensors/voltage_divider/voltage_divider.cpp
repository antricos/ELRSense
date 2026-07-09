#include "voltage_divider.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>

void voltage_divider_init() {
    // analogRead() needs no explicit pin mode on AVR or ESP32.
}

void voltage_divider_poll_and_send() {
    int raw = analogRead(PIN_VOLTAGE_DIV_ADC);
    float adc_mv = (float)raw * VDIV_VREF_MV / (float)ADC_MAX_COUNTS;
    float divider_ratio = (VDIV_R_TOP_OHMS + VDIV_R_BOTTOM_OHMS) / VDIV_R_BOTTOM_OHMS;
    uint16_t battery_mv = (uint16_t)(adc_mv * divider_ratio);

    uint8_t payload[3]; // source_id(1) + one voltage(2)
    uint8_t len = crsf_pack_voltages(payload, VDIV_VOLTAGE_SOURCE_ID, &battery_mv, 1);
    crsf_send_frame(CRSF_FRAMETYPE_VOLTAGES, payload, len);
}
