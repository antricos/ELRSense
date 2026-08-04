/**
 * See mf58_ntc.cpp for why "board.h"/"crsf.h" are included unqualified.
 * GpsSerial is a board-provided serial object (a HardwareSerial UART on the
 * ESP32-C3, a SoftwareSerial on the Pro Mini) so this parser doesn't need to
 * know the underlying UART -- only the RX pin, which the configurator picks
 * per instance (PIN_GPS_RX), and GPS_SERIAL_BEGIN(), which each board
 * defines to start GpsSerial the way its own type needs. TX is left
 * disconnected: this module never sends to the GPS.
 */
#include "gps_m100_5883.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>
#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define GPS_LINE_MAX 96

static char line[GPS_LINE_MAX];
static uint8_t line_len = 0;

static int32_t g_lat_1e7 = 0;
static int32_t g_lon_1e7 = 0;
static uint16_t g_alt_m_offset = 1000; // CRSF GPS altitude field = meters + 1000m offset; 1000 = 0m actual until a fix updates it
static uint16_t g_groundspeed_100 = 0;
static uint16_t g_heading_100 = 0;
static uint8_t g_satellites = 0;

#if GPS_SEND_TIME
static int16_t g_year = 0;
static uint8_t g_month = 0;
static uint8_t g_day = 0;
static uint8_t g_hour = 0;
static uint8_t g_minute = 0;
static uint8_t g_second = 0;
static uint16_t g_millisecond = 0;
#endif

#if GPS_SEND_EXTENDED
// GGA's fix-quality field (0/1/2/...) doubles as CRSF's fix_type verbatim
// -- both are "current GPS fix quality" on the same small integer scale.
static uint8_t g_fix_type = 0;
static int16_t g_n_speed_cms = 0;
static int16_t g_e_speed_cms = 0;
static int16_t g_alt_ellipsoid_m = 0; // altitude MSL + GGA geoid separation
static uint8_t g_hdop_x10 = 0;        // GGA HDOP, fixed-point x10
#endif

// Advances *p past the next comma; returns the field that just ended
// (null-terminated in place, splitting the line buffer).
static char *next_field(char **p) {
    char *start = *p;
    char *comma = strchr(start, ',');
    if (comma) {
        *comma = '\0';
        *p = comma + 1;
    } else {
        *p = start + strlen(start);
    }
    return start;
}

// NMEA (D)DMM.MMMM -> degrees * 1e7. Works for both 2-digit-degree
// (latitude) and 3-digit-degree (longitude) fields: the last two whole
// digits before the decimal point are always minutes, everything before
// that is degrees, regardless of how many degree digits there are.
static int32_t nmea_coord_to_1e7(const char *field, char hemisphere) {
    if (field[0] == '\0') return 0;
    double raw = atof(field);
    double minutes = fmod(raw, 100.0);
    double degrees = (raw - minutes) / 100.0;
    double decimal_degrees = degrees + minutes / 60.0;
    if (hemisphere == 'S' || hemisphere == 'W') decimal_degrees = -decimal_degrees;
    return (int32_t)(decimal_degrees * 1e7);
}

#if GPS_SEND_TIME
// hhmmss.ss (GGA and RMC's first field, same format in both) -> h/m/s +
// milliseconds. Silently no-ops on a too-short/malformed field, leaving
// the previous values in place.
static void parse_time_field(const char *field) {
    if (strlen(field) < 6) return;
    char pair[3] = {0, 0, 0};
    pair[0] = field[0]; pair[1] = field[1]; g_hour = (uint8_t)atoi(pair);
    pair[0] = field[2]; pair[1] = field[3]; g_minute = (uint8_t)atoi(pair);
    pair[0] = field[4]; pair[1] = field[5]; g_second = (uint8_t)atoi(pair);
    const char *dot = strchr(field, '.');
    g_millisecond = dot ? (uint16_t)(atof(dot) * 1000.0f) : 0;
}

// RMC's date field, ddmmyy -> day/month/full year. NMEA's 2-digit year has
// no century marker; treated as 20xx, fine for any date this project will
// ever see in the field.
static void parse_date_field(const char *field) {
    if (strlen(field) < 6) return;
    char pair[3] = {0, 0, 0};
    pair[0] = field[0]; pair[1] = field[1]; g_day = (uint8_t)atoi(pair);
    pair[0] = field[2]; pair[1] = field[3]; g_month = (uint8_t)atoi(pair);
    pair[0] = field[4]; pair[1] = field[5]; g_year = (int16_t)(2000 + atoi(pair));
}
#endif

static void parse_gga(char *body) {
    char *p = body;
    char *time_f = next_field(&p);
    char *lat_f = next_field(&p);
    char *ns_f = next_field(&p);
    char *lon_f = next_field(&p);
    char *ew_f = next_field(&p);
    char *fixq_f = next_field(&p);
    char *sats_f = next_field(&p);
    char *hdop_f = next_field(&p);
    char *alt_f = next_field(&p);
    next_field(&p); // altitude units, always "M"
    char *geoid_f = next_field(&p);
    (void)time_f; (void)hdop_f; (void)geoid_f; // only read under GPS_SEND_TIME/EXTENDED below

    if (fixq_f[0] == '0' || fixq_f[0] == '\0') return;

    g_lat_1e7 = nmea_coord_to_1e7(lat_f, ns_f[0]);
    g_lon_1e7 = nmea_coord_to_1e7(lon_f, ew_f[0]);
    g_satellites = (uint8_t)atoi(sats_f);
    g_alt_m_offset = (uint16_t)(atof(alt_f) + 1000.0f);
#if GPS_SEND_TIME
    parse_time_field(time_f);
#endif
#if GPS_SEND_EXTENDED
    g_fix_type = (uint8_t)atoi(fixq_f);
    float hdop_x10 = atof(hdop_f) * 10.0f;
    g_hdop_x10 = (uint8_t)(hdop_x10 > 255.0f ? 255.0f : hdop_x10);
    g_alt_ellipsoid_m = (int16_t)(atof(alt_f) + atof(geoid_f));
#endif
}

static void parse_rmc(char *body) {
    char *p = body;
    char *time_f = next_field(&p);
    char *status_f = next_field(&p);
    next_field(&p); next_field(&p); // lat, N/S (position comes from GGA)
    next_field(&p); next_field(&p); // lon, E/W
    char *speed_f = next_field(&p);
    char *course_f = next_field(&p);
    char *date_f = next_field(&p);
    (void)time_f; (void)date_f; // only read under GPS_SEND_TIME below

    if (status_f[0] != 'A') return; // 'V' = void, no fix

    float speed_kmh = atof(speed_f) * 1.852f; // knots -> km/h
    float course_deg = atof(course_f);
    g_groundspeed_100 = (uint16_t)(speed_kmh * 100.0f);
    g_heading_100 = (uint16_t)(course_deg * 100.0f);
#if GPS_SEND_TIME
    parse_time_field(time_f);
    parse_date_field(date_f);
#endif
#if GPS_SEND_EXTENDED
    float speed_cms = speed_kmh * (100.0f / 3.6f); // km/h -> cm/s
    float course_rad = course_deg * (float)M_PI / 180.0f;
    g_n_speed_cms = (int16_t)(speed_cms * cosf(course_rad));
    g_e_speed_cms = (int16_t)(speed_cms * sinf(course_rad));
#endif
}

// XORs every byte between '$' and '*' and compares against the two hex
// digits after '*'. A dropped/corrupted byte (SoftwareSerial on the Pro
// Mini has no hardware buffering, so noise or a busy main loop can lose
// one) still forms a line that looks well-formed but carries garbage
// field values -- without this check that garbage gets parsed as if valid.
static bool checksum_ok(const char *line, const char *star) {
    if (!star || !isxdigit((unsigned char)star[1]) || !isxdigit((unsigned char)star[2])) return false;
    uint8_t calc = 0;
    for (const char *p = line + 1; p < star; p++) calc ^= (uint8_t)*p;
    return calc == (uint8_t)strtoul(star + 1, NULL, 16);
}

static void feed_char(char c) {
    if (c == '\r') return;
    if (c == '\n') {
        line[line_len] = '\0';
        if (line_len > 6 && line[0] == '$') {
            char *star = strchr(line, '*');
            if (checksum_ok(line, star)) {
                *star = '\0';
                if (strncmp(line + 3, "GGA,", 4) == 0) parse_gga(line + 7);
                else if (strncmp(line + 3, "RMC,", 4) == 0) parse_rmc(line + 7);
            }
        }
        line_len = 0;
        return;
    }
    if (line_len < GPS_LINE_MAX - 1) line[line_len++] = c;
    else line_len = 0; // overflow guard: drop malformed/oversized line
}

void gps_m100_5883_init() {
    GPS_SERIAL_BEGIN();
    line_len = 0;
}

void gps_m100_5883_poll_and_send() {
    while (GpsSerial.available()) feed_char((char)GpsSerial.read());

    // Sent even without a fix (fields hold their zero/no-fix defaults until
    // GGA reports one) so the radio shows the sensor as present rather than
    // missing entirely while waiting on satellites.
    uint8_t payload[15];
    uint8_t len = crsf_pack_gps(payload, g_lat_1e7, g_lon_1e7,
                                 g_groundspeed_100, g_heading_100,
                                 g_alt_m_offset, g_satellites);
    crsf_send_frame(CRSF_FRAMETYPE_GPS, payload, len);

#if GPS_SEND_TIME
    uint8_t time_payload[10];
    uint8_t time_len = crsf_pack_gps_time(time_payload, g_year, g_month, g_day,
                                           g_hour, g_minute, g_second, g_millisecond);
    crsf_send_frame(CRSF_FRAMETYPE_GPS_TIME, time_payload, time_len);
#endif

#if GPS_SEND_EXTENDED
    uint8_t ext_payload[21];
    uint8_t ext_len = crsf_pack_gps_extended(ext_payload, g_fix_type,
                                              g_n_speed_cms, g_e_speed_cms, 0,
                                              0, 0, g_alt_ellipsoid_m, 0, 0,
                                              g_hdop_x10, 0);
    crsf_send_frame(CRSF_FRAMETYPE_GPS_EXTENDED, ext_payload, ext_len);
#endif
}
