#include "board.h"
#include "crsf.h"

// UART0 (real hardware UART, not the USB-CDC `Serial` global on this chip).
static HardwareSerial CrsfSerial(0);
// UART1, shared by whichever GPS instance is configured (at most one).
HardwareSerial GpsSerial(1);

void crsf_uart_init(uint32_t baud) {
    CrsfSerial.begin(baud, SERIAL_8N1, PIN_CRSF_RX, PIN_CRSF_TX);
}

void crsf_write_byte(uint8_t b) {
    CrsfSerial.write(b);
}
