#include "board.h"
#include "crsf.h"

static HardwareSerial CrsfSerial(1);

void crsf_uart_init(uint32_t baud) {
    // RX pin -1: this board never parses incoming CRSF, only transmits telemetry.
    CrsfSerial.begin(baud, SERIAL_8N1, -1, PIN_CRSF_TX);
}

void crsf_write_byte(uint8_t b) {
    CrsfSerial.write(b);
}
