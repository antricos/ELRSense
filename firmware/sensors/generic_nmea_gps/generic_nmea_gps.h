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

// Optional extra CRSF frames sent alongside 0x02 GPS each poll, once a fix
// has populated their fields (see generic_nmea_gps.cpp -- both are derived
// from GGA/RMC only, so several 0x06 fields a real GNSS receiver would
// report over UBX/NAV messages -- speed/track/position accuracy -- aren't
// available and are sent as 0).
#define GPS_SEND_TIME 0     // 1 = also send CRSF 0x03 GPS Time
#define GPS_SEND_EXTENDED 0 // 1 = also send CRSF 0x06 GPS Extended

void generic_nmea_gps_init();
void generic_nmea_gps_poll_and_send();
