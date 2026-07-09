#include "board.h"
#include "crsf.h"

SoftwareSerial GpsSerial(PIN_GPS_RX, PIN_GPS_TX);

void crsf_uart_init(crsf_baud_t baud) {
    UBRR0H = 0;
    UCSR0A |= (1 << U2X0); // double-speed mode, matches reference/pro-mini-crsf-temp

    switch (baud) {
        case CRSF_BAUD_115200:
            UBRR0L = 8;  // actual ~111111 baud, ~3.6% error - usable
            break;
        case CRSF_BAUD_256000:
        default:
            UBRR0L = 3;  // actual ~250000 baud, ~2.3% error - proven baud rate
            break;
    }

    UCSR0B |= (1 << TXEN0); // TX only: this board never parses incoming CRSF
    UCSR0C = (1 << UCSZ01) | (1 << UCSZ00); // 8N1
}

void crsf_write_byte(uint8_t b) {
    while (!(UCSR0A & (1 << UDRE0)));
    UDR0 = b;
}
