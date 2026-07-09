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
    CRSF_FRAMETYPE_BATTERY         = 0x08,
    CRSF_FRAMETYPE_BARO_ALT_VSPEED = 0x09,
    CRSF_FRAMETYPE_RPM             = 0x0C,
    CRSF_FRAMETYPE_TEMP            = 0x0D,
    CRSF_FRAMETYPE_VOLTAGES        = 0x0E,
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

// --- Baro pack helpers (formulas transcribed from crsf.md) -----------
uint16_t crsf_pack_altitude_dm(int32_t altitude_dm);
int8_t crsf_pack_vertical_speed_cms(int16_t vertical_speed_cm_s);
