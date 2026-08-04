/**
 * ELRSense shared CRSF frame encoding.
 *
 * Board-agnostic: builds and CRC's broadcast CRSF telemetry frames per
 * reference/pro-mini-crsf-temp/crsf.md (mirrors the TBS public CRSF spec).
 * Every board target provides crsf_write_byte() (see boards/<board>/board.h)
 * so this file has no knowledge of UART registers or baud rates.
 *
 * All boards in this project are TX-only telemetry injectors: they only
 * ever call crsf_send_frame(), never parse incoming CRSF traffic.
 */
#pragma once

#include <stdint.h>

#define CRSF_SYNC_BYTE 0xC8
// Frame length byte covers Type + Payload + CRC and must fit uint8_t
// (max whole-frame size is 64 bytes including sync+length); payload is
// capped comfortably below that so this file never needs to chunk frames.
#define CRSF_MAX_PAYLOAD_LEN 58

// Contract every board's board.h must implement: write one raw byte to the
// CRSF UART TX line. crsf.cpp calls this; it never touches UART registers.
void crsf_write_byte(uint8_t b);

typedef enum {
    CRSF_FRAMETYPE_GPS             = 0x02,
    CRSF_FRAMETYPE_GPS_TIME        = 0x03,
    CRSF_FRAMETYPE_GPS_EXTENDED    = 0x06,
    CRSF_FRAMETYPE_BATTERY         = 0x08,
    CRSF_FRAMETYPE_BARO_ALT_VSPEED = 0x09,
    CRSF_FRAMETYPE_RPM             = 0x0C,
    CRSF_FRAMETYPE_TEMP            = 0x0D,
    CRSF_FRAMETYPE_VOLTAGES        = 0x0E,
    CRSF_FRAMETYPE_ACCEL_GYRO      = 0x13,
} crsf_frame_type_t;

// CRC-8, polynomial 0xD5 (Type + Payload only, per CRC section of crsf.md).
uint8_t crsf_crc8(const uint8_t *ptr, uint8_t len);

// Builds [sync][len][type][payload...][crc] and streams it out via
// crsf_write_byte(), which each board implements.
void crsf_send_frame(uint8_t frame_type, const uint8_t *payload, uint8_t payload_len);

// --- Payload packers -------------------------------------------------
// Each fills `buf` (caller-owned, >= the documented size) and returns the
// number of bytes written, ready to hand straight to crsf_send_frame().

// 0x02 GPS (15 bytes)
uint8_t crsf_pack_gps(uint8_t *buf,
                       int32_t latitude_deg_1e7,
                       int32_t longitude_deg_1e7,
                       uint16_t groundspeed_kmh_100,
                       uint16_t heading_deg_100,
                       uint16_t altitude_m_offset,
                       uint8_t satellites);

// 0x03 GPS Time (10 bytes). Needed for sync with the ublox time pulse
// (crsf.md: max offset +/-10ms); year is the full calendar year (e.g. 2026),
// not an offset from 1900/2000.
uint8_t crsf_pack_gps_time(uint8_t *buf,
                            int16_t year, uint8_t month, uint8_t day,
                            uint8_t hour, uint8_t minute, uint8_t second,
                            uint16_t millisecond);

// 0x06 GPS Extended (21 bytes). Fields a plain GGA/RMC parser can't derive
// (h_speed_acc, track_acc, h_acc, v_acc, vDOP) are legitimately zero when
// fed from callers that don't have a real source for them -- see the GPS
// sensor drivers for what they do populate.
uint8_t crsf_pack_gps_extended(uint8_t *buf,
                                uint8_t fix_type,
                                int16_t n_speed, int16_t e_speed, int16_t v_speed,
                                int16_t h_speed_acc, int16_t track_acc,
                                int16_t alt_ellipsoid, int16_t h_acc, int16_t v_acc,
                                uint8_t hdop, uint8_t vdop);

// 0x08 Battery Sensor (8 bytes). voltage/current LSB = 10mV / 10mA
// (see note in project plan: crsf.md's literal 10uV/10uA would cap pack
// voltage at ~0.33V, treated as a doc typo pending real-hardware check).
uint8_t crsf_pack_battery(uint8_t *buf,
                           int16_t voltage_10mV,
                           int16_t current_10mA,
                           uint32_t capacity_used_mah,
                           uint8_t remaining_pct);

// 0x09 Barometric Altitude & Vertical Speed (3 bytes). Pass values already
// packed via crsf_pack_altitude_dm() / crsf_pack_vertical_speed_cms().
uint8_t crsf_pack_baro_alt_vspeed(uint8_t *buf,
                                   uint16_t altitude_packed,
                                   int8_t vertical_speed_packed);

// 0x0C RPM (4 bytes: source_id + one 24-bit rpm value). v1 supports a
// single rpm_value per frame (crsf.md allows up to 19).
uint8_t crsf_pack_rpm(uint8_t *buf, uint8_t source_id, int32_t rpm_value);

// 0x0D TEMP (3 bytes: source_id + one deci-degree-C value). v1 supports a
// single temperature per frame (crsf.md allows up to 20).
uint8_t crsf_pack_temp(uint8_t *buf, uint8_t source_id, int16_t temp_decidegc);

// 0x0E Voltages (uint8 source_id + up to 29 uint16 millivolt values).
// `count` must be <= 29; returns 0 (writes nothing) if it isn't.
uint8_t crsf_pack_voltages(uint8_t *buf, uint8_t source_id,
                            const uint16_t *voltages_mv, uint8_t count);

// 0x13 Accel Gyro (18 bytes). Raw accel/gyro samples in NEU bodyframe
// (crsf.md: +X forward/roll-left, +Y right/pitch-up, +Z up/yaw-clockwise --
// the caller's sensor must be mounted to match, this file has no way to
// correct for mounting orientation), pre-scaled by the caller into CRSF's
// own fixed-point units: gyro LSB = INT16_MAX/2000 DPS, accel LSB =
// INT16_MAX/16 G. sample_time_us is a free-running microsecond timestamp
// (e.g. micros()) of when the sample was taken, not wall-clock time.
uint8_t crsf_pack_accel_gyro(uint8_t *buf, uint32_t sample_time_us,
                              int16_t gyro_x, int16_t gyro_y, int16_t gyro_z,
                              int16_t acc_x, int16_t acc_y, int16_t acc_z,
                              int16_t gyro_temp_centidegc);

// --- Baro pack helpers (formulas transcribed from crsf.md) -----------
uint16_t crsf_pack_altitude_dm(int32_t altitude_dm);
int8_t crsf_pack_vertical_speed_cms(int16_t vertical_speed_cm_s);
