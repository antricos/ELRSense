/**
 * HGLRC M100-5883 (u-blox M10) GPS module, minimal NMEA parsing (GGA +
 * RMC sentences only, checksum not verified) -> CRSF GPS (0x02).
 *
 * Deliberately not TinyGPS++ to keep the flash footprint small -- see
 * project plan for the rationale.
 */
#pragma once
#include <stdint.h>

#define GPS_BAUD 9600 // u-blox M10 default NMEA baud

// Optional extra CRSF frames sent alongside 0x02 GPS each poll, once a fix
// has populated their fields (see gps_m100_5883.cpp -- both are derived
// from GGA/RMC only, so several 0x06 fields a real GNSS receiver would
// report over UBX/NAV messages -- speed/track/position accuracy -- aren't
// available and are sent as 0).
#define GPS_SEND_TIME 0     // 1 = also send CRSF 0x03 GPS Time
#define GPS_SEND_EXTENDED 0 // 1 = also send CRSF 0x06 GPS Extended

void gps_m100_5883_init();
void gps_m100_5883_poll_and_send();
