#include "board.h"
#include "crsf.h"

// SoftwareSerial constructed directly on the configurator-picked RX pin
// (its begin() takes no pins, unlike HardwareSerial). TX pin is unused --
// this module never writes to the GPS.
SoftwareSerial GpsSerial(PIN_GPS_RX, -1);

void crsf_uart_init(uint32_t baud) {
    Serial.begin(baud);
}

void crsf_write_byte(uint8_t b) {
    Serial.write(b);
}
