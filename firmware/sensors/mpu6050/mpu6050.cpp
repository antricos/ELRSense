/**
 * See bmp280.cpp for why "board.h"/"crsf.h" are included unqualified.
 * Assumes the GY-521 is mounted with its silkscreen X axis pointing
 * forward and Y pointing right (CRSF's NEU bodyframe convention, see
 * crsf_pack_accel_gyro()'s comment in crsf.h) -- there's no way for this
 * driver to correct for a different mounting orientation, that's on the
 * installer.
 */
#include "mpu6050.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>
#include <Wire.h>

#define REG_PWR_MGMT_1   0x6B
#define REG_ACCEL_XOUT_H 0x3B

// Power-on default full-scale ranges (no FS_SEL/AFS_SEL write needed):
// accel +/-2g @ 16384 LSB/g, gyro +/-250 DPS @ 131 LSB/DPS (MPU-6050
// register map datasheet).
#define ACCEL_LSB_PER_G  16384.0f
#define GYRO_LSB_PER_DPS 131.0f

// CRSF 0x13's own fixed-point scale (crsf.md): gyro LSB = INT16_MAX/2000
// DPS, accel LSB = INT16_MAX/16 G.
#define CRSF_ACCEL_LSB_PER_G  (32767.0f / 16.0f)
#define CRSF_GYRO_LSB_PER_DPS (32767.0f / 2000.0f)

static void write_reg8(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

static void read_bytes(uint8_t reg, uint8_t *buf, uint8_t len) {
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((int)MPU6050_I2C_ADDR, (int)len);
    for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
}

static int16_t read_be16(const uint8_t *b) {
    return (int16_t)(((uint16_t)b[0] << 8) | b[1]);
}

void mpu6050_init() {
    I2C_INIT();
    write_reg8(REG_PWR_MGMT_1, 0x00); // wake up: clear the sleep bit, default 8MHz internal clock
    delay(10);
}

void mpu6050_poll_and_send() {
    // ACCEL_XOUT_H..GYRO_ZOUT_L is one contiguous 14-byte block: accel
    // x/y/z, onboard temp, gyro x/y/z, each a big-endian int16.
    uint8_t d[14];
    read_bytes(REG_ACCEL_XOUT_H, d, 14);

    int16_t acc_x_raw = read_be16(d + 0);
    int16_t acc_y_raw = read_be16(d + 2);
    int16_t acc_z_raw = read_be16(d + 4);
    int16_t temp_raw = read_be16(d + 6);
    int16_t gyro_x_raw = read_be16(d + 8);
    int16_t gyro_y_raw = read_be16(d + 10);
    int16_t gyro_z_raw = read_be16(d + 12);

    // Raw register counts -> physical units -> CRSF's own fixed-point scale.
    int16_t acc_x = (int16_t)(acc_x_raw / ACCEL_LSB_PER_G * CRSF_ACCEL_LSB_PER_G);
    int16_t acc_y = (int16_t)(acc_y_raw / ACCEL_LSB_PER_G * CRSF_ACCEL_LSB_PER_G);
    int16_t acc_z = (int16_t)(acc_z_raw / ACCEL_LSB_PER_G * CRSF_ACCEL_LSB_PER_G);
    int16_t gyro_x = (int16_t)(gyro_x_raw / GYRO_LSB_PER_DPS * CRSF_GYRO_LSB_PER_DPS);
    int16_t gyro_y = (int16_t)(gyro_y_raw / GYRO_LSB_PER_DPS * CRSF_GYRO_LSB_PER_DPS);
    int16_t gyro_z = (int16_t)(gyro_z_raw / GYRO_LSB_PER_DPS * CRSF_GYRO_LSB_PER_DPS);
    // MPU-6050 register map datasheet: Temp_degC = raw/340 + 36.53.
    int16_t gyro_temp_centidegc = (int16_t)((temp_raw / 340.0f + 36.53f) * 100.0f);

    uint8_t payload[18];
    uint8_t len = crsf_pack_accel_gyro(payload, micros(),
                                        gyro_x, gyro_y, gyro_z,
                                        acc_x, acc_y, acc_z,
                                        gyro_temp_centidegc);
    crsf_send_frame(CRSF_FRAMETYPE_ACCEL_GYRO, payload, len);
}
