/**
 * Native CRSF 0x0D (TEMP) Telemetry Transmitter (Single Sensor)
 * Hardware: MF58 10k NTC Thermistor on Pin A3
 * Board: Arduino Pro Mini (3.3V / 8MHz)
 * Baud Rate: 256,000 Baud
 */

#include <Arduino.h>

#define CRSF_ADDRESS_FLIGHT_CONTROLLER  0xC8
#define CRSF_FRAMETYPE_TEMP             0x0D  // Native TBS/ELRS Temperature Frame

const int THERMISTOR_PIN = A3;

// --- MF58 Thermistor & Voltage Divider Parameters ---
const float BALANCE_RESISTOR = 10000.0; // 10k divider resistor
const float ROOM_TEMP_KELVIN = 298.15;  // 25°C in Kelvin
const float THERMISTOR_NOMINAL = 10000.0; // 10k at 25°C
const float BETA_COEFFICIENT = 3950.0;  // Standard MF58 Beta value

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

// Function to calculate temperature in Celsius from Pin A3
int16_t readMF58Temperature(int pin) {
    int rawADC = analogRead(pin);

    // Prevent divide-by-zero or out-of-range mathematical errors
    if (rawADC <= 0 || rawADC >= 1023) return 0;

    // Calculate thermistor resistance based on the 10k voltage divider circuit
    float resistance = BALANCE_RESISTOR * ((1023.0 / (float)rawADC) - 1.0);

    // Apply the Beta-parameter Steinhart-Hart Equation
    float steinhart;
    steinhart = resistance / THERMISTOR_NOMINAL;     // (R/Ro)
    steinhart = log(steinhart);                      // ln(R/Ro)
    steinhart /= BETA_COEFFICIENT;                   // 1/B * ln(R/Ro)
    steinhart += 1.0 / ROOM_TEMP_KELVIN;             // + (1/To)
    steinhart = 1.0 / steinhart;                     // Invert to get Kelvin
    steinhart -= 273.15;                             // Convert Kelvin to Celsius

    return (int16_t)round(steinhart); // Return rounded integer value (°C)
}

void setup() {
    analogReference(DEFAULT); // Standard 3.3V reference

    // Force precise 256,000 Baud configuration for an 8MHz Arduino Pro Mini clock
    UBRR0H = 0;
    UBRR0L = 3;
    UCSR0A |= (1 << U2X0);
    UCSR0B |= (1 << TXEN0); // Enable TX pin only
    UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
}

void sendNativeTemperatureTelemetry(int16_t t1) {
    // Packet Structure:
    // [0] Sync/Dest (0xC8)
    // [1] Length: Type(1) + SourceID(1) + 1xTemp(2) + CRC(1) = 5 Bytes
    // [2] Frame Type (0x0D)
    // [3] Source ID (0x01 = Ambient/External)
    // [4-5] Temp 1 (16-bit Big-Endian, scaled to deci-degrees)
    // [6] CRC-8
    
    uint8_t packet[7];
    packet[0] = CRSF_ADDRESS_FLIGHT_CONTROLLER;
    packet[1] = 5; // Updated total payload length
    packet[2] = CRSF_FRAMETYPE_TEMP;
    packet[3] = 0x01; // Source ID 1 (Ambient/External)

    // Scale temperature to deci-degrees (multiplied by 10) for protocol transmission
    int16_t scaled_t1 = t1 * 10;

    // Pack Temp 1 (Big-Endian format)
    packet[4] = (scaled_t1 >> 8) & 0xFF;
    packet[5] = scaled_t1 & 0xFF;

    // Calculate CRC over frame type and payload bytes (4 bytes: Type + SourceID + 2xTempBytes)
    packet[6] = calculateCrsfCrc(&packet[2], 4);

    // Stream the 7-byte packet directly down the TX wire
    for (uint8_t i = 0; i < 7; i++) {
        sendByte(packet[i]);
    }
}

void loop() {
    // Read live temperature from pin A3
    int16_t sensorTemp = readMF58Temperature(THERMISTOR_PIN);

    // Send the single-sensor native CRSF telemetry frame
    sendNativeTemperatureTelemetry(sensorTemp);

    // Polling rate of 100ms
    delay(100);
}