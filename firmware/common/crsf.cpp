#include "crsf.h"
#include <math.h>

uint8_t crsf_crc8(const uint8_t *ptr, uint8_t len) {
    uint8_t crc = 0;
    while (len--) {
        crc ^= *ptr++;
        for (uint8_t i = 0; i < 8; i++) {
            if (crc & 0x80) crc = (crc << 1) ^ 0xD5;
            else crc <<= 1;
        }
    }
    return crc;
}

void crsf_send_frame(uint8_t frame_type, const uint8_t *payload, uint8_t payload_len) {
    if (payload_len > CRSF_MAX_PAYLOAD_LEN) return;

    // [sync][len][type][payload...][crc]
    uint8_t packet[2 + 1 + CRSF_MAX_PAYLOAD_LEN + 1];
    packet[0] = CRSF_SYNC_BYTE;
    packet[1] = payload_len + 2; // Type(1) + Payload + CRC(1)
    packet[2] = frame_type;
    for (uint8_t i = 0; i < payload_len; i++) packet[3 + i] = payload[i];

    // CRC covers Type + Payload only (not sync/length), per crsf.md.
    packet[3 + payload_len] = crsf_crc8(&packet[2], payload_len + 1);

    uint8_t total_len = 4 + payload_len;
    for (uint8_t i = 0; i < total_len; i++) crsf_write_byte(packet[i]);
}

// --- big-endian write helpers -----------------------------------------

static uint8_t write_u8(uint8_t *buf, uint8_t v) {
    buf[0] = v;
    return 1;
}

static uint8_t write_be16(uint8_t *buf, uint16_t v) {
    buf[0] = (uint8_t)(v >> 8);
    buf[1] = (uint8_t)(v & 0xFF);
    return 2;
}

static uint8_t write_be24(uint8_t *buf, uint32_t v) {
    buf[0] = (uint8_t)((v >> 16) & 0xFF);
    buf[1] = (uint8_t)((v >> 8) & 0xFF);
    buf[2] = (uint8_t)(v & 0xFF);
    return 3;
}

static uint8_t write_be32(uint8_t *buf, uint32_t v) {
    buf[0] = (uint8_t)((v >> 24) & 0xFF);
    buf[1] = (uint8_t)((v >> 16) & 0xFF);
    buf[2] = (uint8_t)((v >> 8) & 0xFF);
    buf[3] = (uint8_t)(v & 0xFF);
    return 4;
}

// --- payload packers ----------------------------------------------------

uint8_t crsf_pack_gps(uint8_t *buf,
                       int32_t latitude_deg_1e7,
                       int32_t longitude_deg_1e7,
                       uint16_t groundspeed_kmh_100,
                       uint16_t heading_deg_100,
                       uint16_t altitude_m_offset,
                       uint8_t satellites) {
    uint8_t n = 0;
    n += write_be32(buf + n, (uint32_t)latitude_deg_1e7);
    n += write_be32(buf + n, (uint32_t)longitude_deg_1e7);
    n += write_be16(buf + n, groundspeed_kmh_100);
    n += write_be16(buf + n, heading_deg_100);
    n += write_be16(buf + n, altitude_m_offset);
    n += write_u8(buf + n, satellites);
    return n; // 15
}

uint8_t crsf_pack_gps_time(uint8_t *buf,
                            int16_t year, uint8_t month, uint8_t day,
                            uint8_t hour, uint8_t minute, uint8_t second,
                            uint16_t millisecond) {
    uint8_t n = 0;
    n += write_be16(buf + n, (uint16_t)year);
    n += write_u8(buf + n, month);
    n += write_u8(buf + n, day);
    n += write_u8(buf + n, hour);
    n += write_u8(buf + n, minute);
    n += write_u8(buf + n, second);
    n += write_be16(buf + n, millisecond);
    return n; // 10
}

uint8_t crsf_pack_gps_extended(uint8_t *buf,
                                uint8_t fix_type,
                                int16_t n_speed, int16_t e_speed, int16_t v_speed,
                                int16_t h_speed_acc, int16_t track_acc,
                                int16_t alt_ellipsoid, int16_t h_acc, int16_t v_acc,
                                uint8_t hdop, uint8_t vdop) {
    uint8_t n = 0;
    n += write_u8(buf + n, fix_type);
    n += write_be16(buf + n, (uint16_t)n_speed);
    n += write_be16(buf + n, (uint16_t)e_speed);
    n += write_be16(buf + n, (uint16_t)v_speed);
    n += write_be16(buf + n, (uint16_t)h_speed_acc);
    n += write_be16(buf + n, (uint16_t)track_acc);
    n += write_be16(buf + n, (uint16_t)alt_ellipsoid);
    n += write_be16(buf + n, (uint16_t)h_acc);
    n += write_be16(buf + n, (uint16_t)v_acc);
    n += write_u8(buf + n, 0); // reserved
    n += write_u8(buf + n, hdop);
    n += write_u8(buf + n, vdop);
    return n; // 21
}

uint8_t crsf_pack_battery(uint8_t *buf,
                           int16_t voltage_10mV,
                           int16_t current_10mA,
                           uint32_t capacity_used_mah,
                           uint8_t remaining_pct) {
    uint8_t n = 0;
    n += write_be16(buf + n, (uint16_t)voltage_10mV);
    n += write_be16(buf + n, (uint16_t)current_10mA);
    n += write_be24(buf + n, capacity_used_mah);
    n += write_u8(buf + n, remaining_pct);
    return n; // 8
}

uint8_t crsf_pack_baro_alt_vspeed(uint8_t *buf,
                                   uint16_t altitude_packed,
                                   int8_t vertical_speed_packed) {
    uint8_t n = 0;
    n += write_be16(buf + n, altitude_packed);
    n += write_u8(buf + n, (uint8_t)vertical_speed_packed);
    return n; // 3
}

uint8_t crsf_pack_rpm(uint8_t *buf, uint8_t source_id, int32_t rpm_value) {
    uint8_t n = 0;
    n += write_u8(buf + n, source_id);
    n += write_be24(buf + n, (uint32_t)rpm_value & 0xFFFFFF);
    return n; // 4
}

uint8_t crsf_pack_temp(uint8_t *buf, uint8_t source_id, int16_t temp_decidegc) {
    uint8_t n = 0;
    n += write_u8(buf + n, source_id);
    n += write_be16(buf + n, (uint16_t)temp_decidegc);
    return n; // 3
}

uint8_t crsf_pack_voltages(uint8_t *buf, uint8_t source_id,
                            const uint16_t *voltages_mv, uint8_t count) {
    if (count > 29) return 0;
    uint8_t n = 0;
    n += write_u8(buf + n, source_id);
    for (uint8_t i = 0; i < count; i++) n += write_be16(buf + n, voltages_mv[i]);
    return n;
}

uint8_t crsf_pack_accel_gyro(uint8_t *buf, uint32_t sample_time_us,
                              int16_t gyro_x, int16_t gyro_y, int16_t gyro_z,
                              int16_t acc_x, int16_t acc_y, int16_t acc_z,
                              int16_t gyro_temp_centidegc) {
    uint8_t n = 0;
    n += write_be32(buf + n, sample_time_us);
    n += write_be16(buf + n, (uint16_t)gyro_x);
    n += write_be16(buf + n, (uint16_t)gyro_y);
    n += write_be16(buf + n, (uint16_t)gyro_z);
    n += write_be16(buf + n, (uint16_t)acc_x);
    n += write_be16(buf + n, (uint16_t)acc_y);
    n += write_be16(buf + n, (uint16_t)acc_z);
    n += write_be16(buf + n, (uint16_t)gyro_temp_centidegc);
    return n; // 18
}

// --- baro pack helpers, transcribed from crsf.md ------------------------

uint16_t crsf_pack_altitude_dm(int32_t altitude_dm) {
    const int32_t ALT_MIN_DM = 10000;                        // minimum altitude in dm
    const int32_t ALT_THRESHOLD_DM = 0x8000 - ALT_MIN_DM;     // dm-resolution range boundary
    const int32_t ALT_MAX_DM = (int32_t)0x7FFE * 10 - 5;      // maximum altitude in dm

    if (altitude_dm < -ALT_MIN_DM) return 0;
    if (altitude_dm > ALT_MAX_DM) return 0xFFFE;
    if (altitude_dm < ALT_THRESHOLD_DM) return (uint16_t)(altitude_dm + ALT_MIN_DM);
    return (uint16_t)(((altitude_dm + 5) / 10) | 0x8000);
}

int8_t crsf_pack_vertical_speed_cms(int16_t vertical_speed_cm_s) {
    const float Kl = 100.0f; // linearity constant
    const float Kr = 0.026f; // range constant

    if (vertical_speed_cm_s == 0) return 0;
    float mag = logf(fabsf((float)vertical_speed_cm_s) / Kl + 1.0f) / Kr;
    int8_t packed = (int8_t)mag;
    return (vertical_speed_cm_s < 0) ? (int8_t)(-packed) : packed;
}
