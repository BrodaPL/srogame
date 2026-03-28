import { describe, expect, it } from 'vitest';
import {
  calculateSensorPhalanxActiveScanRange,
  calculateSensorPhalanxNormalRange,
  calculateSensorPhalanxScansPerTurn
} from '../sensor-phalanx';

describe('Sensor Phalanx helpers', () => {
  it('calculates normal range from level, anomalies/noise, and building effectiveness', () => {
    expect(calculateSensorPhalanxNormalRange(5, 1.4, 0.5)).toBe(3);
    expect(calculateSensorPhalanxNormalRange(0, 1.4, 1)).toBe(0);
    expect(calculateSensorPhalanxNormalRange(5, 0, 1)).toBe(0);
  });

  it('derives half-range active scan distance with a minimum of 1 when operational', () => {
    expect(calculateSensorPhalanxActiveScanRange(0)).toBe(0);
    expect(calculateSensorPhalanxActiveScanRange(1)).toBe(1);
    expect(calculateSensorPhalanxActiveScanRange(6)).toBe(3);
  });

  it('scales scan count with sqrt(level) and building effectiveness', () => {
    expect(calculateSensorPhalanxScansPerTurn(1, 1)).toBe(1);
    expect(calculateSensorPhalanxScansPerTurn(9, 1)).toBe(3);
    expect(calculateSensorPhalanxScansPerTurn(9, 0.49)).toBe(1);
    expect(calculateSensorPhalanxScansPerTurn(9, 0)).toBe(0);
  });
});
