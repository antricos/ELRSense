#include "ina226.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>
#include <Wire.h>

#define REG_CONFIG  0x00
#define REG_BUS_V   0x02
#define REG_CURRENT 0x04
#define REG_CAL     0x05

static float current_lsb_a;
static float capacity_used_mah = 0.0f;
static uint32_t last_poll_ms = 0;

static void write_reg16(uint8_t reg, uint16_t value) {
    Wire.beginTransmission(INA226_I2C_ADDR);
    Wire.write(reg);
    Wire.write((uint8_t)(value >> 8));
    Wire.write((uint8_t)(value & 0xFF));
    Wire.endTransmission();
}

static uint16_t read_reg16(uint8_t reg) {
    Wire.beginTransmission(INA226_I2C_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((int)INA226_I2C_ADDR, 2);
    uint8_t hi = Wire.read();
    uint8_t lo = Wire.read();
    return ((uint16_t)hi << 8) | lo;
}

void ina226_init() {
    I2C_INIT();

    current_lsb_a = INA226_MAX_CURRENT_A / 32768.0f;
    uint16_t cal_value = (uint16_t)(0.00512f / (current_lsb_a * INA226_SHUNT_OHMS));

    write_reg16(REG_CONFIG, 0x4127); // INA226 POR default: 16x avg, 1.1ms conv, continuous shunt+bus
    write_reg16(REG_CAL, cal_value);

    last_poll_ms = millis();
}

void ina226_poll_and_send() {
    uint16_t bus_raw = read_reg16(REG_BUS_V);                 // LSB = 1.25mV
    int16_t current_raw = (int16_t)read_reg16(REG_CURRENT);   // LSB = current_lsb_a

    float bus_voltage_v = bus_raw * 0.00125f;
    float current_a = current_raw * current_lsb_a;

    uint32_t now = millis();
    float elapsed_h = (now - last_poll_ms) / 3600000.0f;
    last_poll_ms = now;
    capacity_used_mah += current_a * 1000.0f * elapsed_h;
    if (capacity_used_mah < 0) capacity_used_mah = 0;

    int16_t voltage_10mv = (int16_t)(bus_voltage_v * 100.0f); // LSB = 10mV
    int16_t current_10ma = (int16_t)(current_a * 100.0f);     // LSB = 10mA

    float remaining_pct_f = 100.0f - (capacity_used_mah / INA226_BATTERY_CAPACITY_MAH * 100.0f);
    if (remaining_pct_f < 0) remaining_pct_f = 0;
    if (remaining_pct_f > 100) remaining_pct_f = 100;

    uint8_t payload[8];
    uint8_t len = crsf_pack_battery(payload, voltage_10mv, current_10ma,
                                     (uint32_t)capacity_used_mah, (uint8_t)remaining_pct_f);
    crsf_send_frame(CRSF_FRAMETYPE_BATTERY, payload, len);
}
