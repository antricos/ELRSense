/**
 * Native CRSF 0x0D (TEMP) Telemetry Transmitter
 * Target Board: Arduino Pro Mini (3.3V / 8MHz)
 * Baud Rate: 256,000 Baud
 * No Lua script required. EdgeTX detects these natively.
 */

#include <Arduino.h>

#define CRSF_ADDRESS_FLIGHT_CONTROLLER  0xC8
#define CRSF_FRAMETYPE_TEMP             0x0D  // Native TBS/ELRS Temperature Frame

// Your two temperatures as normal whole numbers (e.g., 25°C and 26°C)
int16_t sensorTemp1 = 25;
int16_t sensorTemp2 = 26;

// Standard Crossfire/ELRS CRC-8 calculation
uint8_t calculateCrsfCrc(const uint8_t *ptr, uint8_t len) {
    uint8_t crc = 0;
    while (len--) {
        crc ^= *ptr++;
        for (uint8_t i = 0; i < 8; i++) {
            if (crc & 0x80) crc = (crc << 1) ^ 0xD5;
            else crc <<= 1;
        }
    }
    return crc;
}

// Low-level hardware byte writer for ATMega328P @ 256000 baud
void sendByte(uint8_t b) {
    while (!(UCSR0A & (1 << UDRE0)));
    UDR0 = b;
}

void setup() {
    // Force precise 256,000 Baud configuration for an 8MHz Arduino Pro Mini clock
    UBRR0H = 0;
    UBRR0L = 3;
    UCSR0A |= (1 << U2X0);
    UCSR0B |= (1 << TXEN0); // Enable TX pin only (no RX lines needed)
    UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
}

void sendNativeTemperatureTelemetry(int16_t t1, int16_t t2) {
    // Packet Structure:
    // [0] Sync/Dest (0xC8)
    // [1] Length: Type(1) + SourceID(1) + 2xTemp(4) + CRC(1) = 7 Bytes
    // [2] Frame Type (0x0D)
    // [3] Source ID (0x01 = Custom/Ambient sensor source cluster)
    // [4-5] Temp 1 (16-bit Big-Endian, scaled to deci-degrees)
    // [6-7] Temp 2 (16-bit Big-Endian, scaled to deci-degrees)
    // [8] CRC-8

    uint8_t packet[9];
    packet[0] = CRSF_ADDRESS_FLIGHT_CONTROLLER;
    packet[1] = 7;
    packet[2] = CRSF_FRAMETYPE_TEMP;
    packet[3] = 0x01; // Source ID 1 (Ambient/User external telemetry probes)

    // Scale temperatures to deci-degrees (multiplied by 10)
    int16_t scaled_t1 = t1 * 10;
    int16_t scaled_t2 = t2 * 10;

    // Pack Temp 1 (Big-Endian format required by native CRSF protocol specifications)
    packet[4] = (scaled_t1 >> 8) & 0xFF;
    packet[5] = scaled_t1 & 0xFF;

    // Pack Temp 2 (Big-Endian format)
    packet[6] = (scaled_t2 >> 8) & 0xFF;
    packet[7] = scaled_t2 & 0xFF;

    // Calculate CRC over frame type and data payload bytes (6 bytes total)
    packet[8] = calculateCrsfCrc(&packet[2], 6);

    // Stream the packet bytes directly down the TX wire
    for (uint8_t i = 0; i < 9; i++) {
        sendByte(packet[i]);
    }
}

void loop() {
    // Continuously stream your telemetry variables down to the receiver link
    sendNativeTemperatureTelemetry(sensorTemp1, sensorTemp2);

    // 100ms stream timing interval ensures stable sensor polling on the handset
    delay(100);
}
