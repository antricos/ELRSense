/**
 * See mf58_ntc.cpp for why "board.h"/"crsf.h" are included unqualified.
 * GpsSerial is a board-provided serial object (a HardwareSerial UART on the
 * ESP32-C3, a SoftwareSerial on the Pro Mini) so this parser doesn't need to
 * know the underlying UART -- only the RX pin, which the configurator picks
 * per instance (PIN_GPS_RX), and GPS_SERIAL_BEGIN(), which each board
 * defines to start GpsSerial the way its own type needs. TX is left
 * disconnected: this module never sends to the GPS.
 */
#include "generic_nmea_gps.h"
#include "board.h"
#include "crsf.h"
#include <Arduino.h>
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

static void parse_gga(char *body) {
    char *p = body;
    next_field(&p); // time
    char *lat_f = next_field(&p);
    char *ns_f = next_field(&p);
    char *lon_f = next_field(&p);
    char *ew_f = next_field(&p);
    char *fixq_f = next_field(&p);
    char *sats_f = next_field(&p);
    next_field(&p); // HDOP
    char *alt_f = next_field(&p);

    if (fixq_f[0] == '0' || fixq_f[0] == '\0') return;

    g_lat_1e7 = nmea_coord_to_1e7(lat_f, ns_f[0]);
    g_lon_1e7 = nmea_coord_to_1e7(lon_f, ew_f[0]);
    g_satellites = (uint8_t)atoi(sats_f);
    g_alt_m_offset = (uint16_t)(atof(alt_f) + 1000.0f);
}

static void parse_rmc(char *body) {
    char *p = body;
    next_field(&p);                 // time
    char *status_f = next_field(&p);
    next_field(&p); next_field(&p); // lat, N/S (position comes from GGA)
    next_field(&p); next_field(&p); // lon, E/W
    char *speed_f = next_field(&p);
    char *course_f = next_field(&p);

    if (status_f[0] != 'A') return; // 'V' = void, no fix

    float speed_kmh = atof(speed_f) * 1.852f; // knots -> km/h
    g_groundspeed_100 = (uint16_t)(speed_kmh * 100.0f);
    g_heading_100 = (uint16_t)(atof(course_f) * 100.0f);
}

static void feed_char(char c) {
    if (c == '\r') return;
    if (c == '\n') {
        line[line_len] = '\0';
        if (line_len > 6 && line[0] == '$') {
            char *star = strchr(line, '*'); // strip checksum suffix, not verified
            if (star) *star = '\0';

            if (strncmp(line + 3, "GGA,", 4) == 0) parse_gga(line + 7);
            else if (strncmp(line + 3, "RMC,", 4) == 0) parse_rmc(line + 7);
        }
        line_len = 0;
        return;
    }
    if (line_len < GPS_LINE_MAX - 1) line[line_len++] = c;
    else line_len = 0; // overflow guard: drop malformed/oversized line
}

void generic_nmea_gps_init() {
    GPS_SERIAL_BEGIN();
    line_len = 0;
}

void generic_nmea_gps_poll_and_send() {
    while (GpsSerial.available()) feed_char((char)GpsSerial.read());

    // Sent even without a fix (fields hold their zero/no-fix defaults until
    // GGA reports one) so the radio shows the sensor as present rather than
    // missing entirely while waiting on satellites.
    uint8_t payload[15];
    uint8_t len = crsf_pack_gps(payload, g_lat_1e7, g_lon_1e7,
                                 g_groundspeed_100, g_heading_100,
                                 g_alt_m_offset, g_satellites);
    crsf_send_frame(CRSF_FRAMETYPE_GPS, payload, len);
}
