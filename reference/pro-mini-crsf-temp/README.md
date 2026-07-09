# CRSF Temperature Telemetry — Arduino Pro Mini (reference)

Known-working baseline, confirmed on an Arduino Pro Mini (3.3V / 8MHz).
Sends native CRSF frame type `0x0D` (TEMP) over a raw UART TX at 256,000
baud so EdgeTX detects the two temperature sensors with no Lua script.

Kept here unmodified as a reference implementation of the CRSF framing,
CRC-8, and packet layout before porting the approach to ESP32 (which
needs `HardwareSerial` instead of direct ATmega328P UART registers).
