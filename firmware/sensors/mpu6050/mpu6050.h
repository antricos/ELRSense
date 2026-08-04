/**
 * MPU-6050 6-axis accel/gyro (as sold on the GY-521 breakout), direct
 * register access -> CRSF Accel Gyro (0x13).
 *
 * Read at the chip's power-on default full-scale ranges (+/-2g accel,
 * +/-250 DPS gyro) -- no FS_SEL/AFS_SEL register writes, so this stays a
 * couple of register pokes rather than a full driver.
 */
#pragma once
#include <stdint.h>

#define MPU6050_I2C_ADDR 0x68 // 0x69 if the module's AD0 pin is pulled high

void mpu6050_init();
void mpu6050_poll_and_send();
