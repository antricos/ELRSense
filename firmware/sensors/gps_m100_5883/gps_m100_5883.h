/**
 * HGLRC M100-5883 (u-blox M10) GPS module, minimal NMEA parsing (GGA +
 * RMC sentences only, checksum not verified) -> CRSF GPS (0x02).
 *
 * Deliberately not TinyGPS++ to keep the flash footprint small on the
 * Pro Mini -- see project plan for the rationale.
 */
#pragma once
#include <stdint.h>

#define GPS_BAUD 9600 // u-blox M10 default NMEA baud

void gps_m100_5883_init();
void gps_m100_5883_poll_and_send();
