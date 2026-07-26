/**
 * Generic NMEA 0183 GPS module (GGA + RMC sentences only, checksum not
 * verified) -> CRSF GPS (0x02). Talker ID (GP/GN/GA/...) is not checked, so
 * this covers any module that emits standard NMEA text at a fixed baud --
 * see gps_m100_5883 for the same parser under a specific product name.
 *
 * Deliberately not TinyGPS++ to keep the flash footprint small -- see
 * project plan for the rationale.
 */
#pragma once
#include <stdint.h>

#define GPS_BAUD 9600 // most NMEA modules default here; override to match yours

void generic_nmea_gps_init();
void generic_nmea_gps_poll_and_send();
