#include "bmp280.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>
#include <Wire.h>
#include <math.h>

#define REG_CALIB_START 0x88
#define REG_CTRL_MEAS   0xF4
#define REG_CONFIG      0xF5
#define REG_PRESS_MSB   0xF7

static uint16_t dig_T1;
static int16_t dig_T2, dig_T3;
static uint16_t dig_P1;
static int16_t dig_P2, dig_P3, dig_P4, dig_P5, dig_P6, dig_P7, dig_P8, dig_P9;
static double t_fine;

static float ground_altitude_m = 0.0f;
static float last_altitude_m = 0.0f;
static uint32_t last_poll_ms = 0;
static bool calibrated_ground = false;

static void write_reg8(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(BMP280_I2C_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

static void read_bytes(uint8_t reg, uint8_t *buf, uint8_t len) {
    Wire.beginTransmission(BMP280_I2C_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((int)BMP280_I2C_ADDR, (int)len);
    for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
}

static void read_calibration() {
    uint8_t c[24];
    read_bytes(REG_CALIB_START, c, 24);
    dig_T1 = (uint16_t)(c[0] | (c[1] << 8));
    dig_T2 = (int16_t)(c[2] | (c[3] << 8));
    dig_T3 = (int16_t)(c[4] | (c[5] << 8));
    dig_P1 = (uint16_t)(c[6] | (c[7] << 8));
    dig_P2 = (int16_t)(c[8] | (c[9] << 8));
    dig_P3 = (int16_t)(c[10] | (c[11] << 8));
    dig_P4 = (int16_t)(c[12] | (c[13] << 8));
    dig_P5 = (int16_t)(c[14] | (c[15] << 8));
    dig_P6 = (int16_t)(c[16] | (c[17] << 8));
    dig_P7 = (int16_t)(c[18] | (c[19] << 8));
    dig_P8 = (int16_t)(c[20] | (c[21] << 8));
    dig_P9 = (int16_t)(c[22] | (c[23] << 8));
}

// Bosch datasheet double-precision compensation formulas. Sets t_fine as a
// side effect, which compensate_pressure() depends on -- always call
// compensate_temperature() first each cycle.
static double compensate_temperature(int32_t adc_T) {
    double var1 = (((double)adc_T) / 16384.0 - ((double)dig_T1) / 1024.0) * (double)dig_T2;
    double var2 = ((((double)adc_T) / 131072.0 - ((double)dig_T1) / 8192.0) *
                   (((double)adc_T) / 131072.0 - ((double)dig_T1) / 8192.0)) * (double)dig_T3;
    t_fine = var1 + var2;
    return (var1 + var2) / 5120.0;
}

static double compensate_pressure(int32_t adc_P) {
    double var1 = (t_fine / 2.0) - 64000.0;
    double var2 = var1 * var1 * ((double)dig_P6) / 32768.0;
    var2 = var2 + var1 * ((double)dig_P5) * 2.0;
    var2 = (var2 / 4.0) + (((double)dig_P4) * 65536.0);
    var1 = (((double)dig_P3) * var1 * var1 / 524288.0 + ((double)dig_P2) * var1) / 524288.0;
    var1 = (1.0 + var1 / 32768.0) * ((double)dig_P1);
    if (var1 == 0.0) return 0.0; // avoid div-by-zero if calibration hasn't been read yet
    double p = 1048576.0 - (double)adc_P;
    p = (p - (var2 / 4096.0)) * 6250.0 / var1;
    var1 = ((double)dig_P9) * p * p / 2147483648.0;
    var2 = p * ((double)dig_P8) / 32768.0;
    p = p + (var1 + var2 + ((double)dig_P7)) / 16.0;
    return p; // Pa
}

static void read_raw(int32_t *adc_T, int32_t *adc_P) {
    uint8_t d[6];
    read_bytes(REG_PRESS_MSB, d, 6);
    *adc_P = ((int32_t)d[0] << 12) | ((int32_t)d[1] << 4) | (d[2] >> 4);
    *adc_T = ((int32_t)d[3] << 12) | ((int32_t)d[4] << 4) | (d[5] >> 4);
}

void bmp280_init() {
    I2C_INIT();
    read_calibration();
    write_reg8(REG_CTRL_MEAS, 0x27); // temp oversample x1, press oversample x1, normal mode
    write_reg8(REG_CONFIG, 0xA0);    // standby 1000ms, filter off
    delay(10);
    calibrated_ground = false;
    last_poll_ms = millis();
}

void bmp280_poll_and_send() {
    int32_t adc_T, adc_P;
    read_raw(&adc_T, &adc_P);

    compensate_temperature(adc_T); // sets t_fine
    double pressure_pa = compensate_pressure(adc_P);
    if (pressure_pa <= 0.0) return; // sensor not ready / read error, skip this cycle

    // Standard barometric formula referenced to sea-level 101325 Pa; CRSF
    // wants altitude above the start/calibration point, so the first
    // successful reading below becomes the zero reference instead.
    double altitude_m = 44330.0 * (1.0 - pow(pressure_pa / 101325.0, 0.1903));

    uint32_t now = millis();
    if (!calibrated_ground) {
        ground_altitude_m = (float)altitude_m;
        last_altitude_m = (float)altitude_m;
        last_poll_ms = now;
        calibrated_ground = true;
        return; // first sample only sets the zero point, doesn't send yet
    }

    double relative_altitude_m = altitude_m - ground_altitude_m;

    float elapsed_s = (now - last_poll_ms) / 1000.0f;
    if (elapsed_s <= 0) elapsed_s = 0.001f; // guard divide-by-zero if polled twice in the same ms
    float vspeed_cms = (float)(((double)altitude_m - (double)last_altitude_m) * 100.0 / elapsed_s);

    last_altitude_m = (float)altitude_m;
    last_poll_ms = now;

    uint16_t alt_packed = crsf_pack_altitude_dm((int32_t)(relative_altitude_m * 10.0));
    int8_t vspeed_packed = crsf_pack_vertical_speed_cms((int16_t)vspeed_cms);

    uint8_t payload[3];
    uint8_t len = crsf_pack_baro_alt_vspeed(payload, alt_packed, vspeed_packed);
    crsf_send_frame(CRSF_FRAMETYPE_BARO_ALT_VSPEED, payload, len);
}
