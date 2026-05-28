import { describe, expect, it } from 'vitest';
import { ShipType } from '../enums/ship-type';
import { ManyShips } from '../fleets/many-ships';
import { appendFleetReportShips, formatFleetReportShips } from './fleet-report';

describe('fleet report ship formatting', () => {
  it('formats undamaged and damaged ships by type', () => {
    const ships = ManyShips.empty();
    ships.addUndamaged(ShipType.TRANSPORTER, 2);
    ships.addUndamaged(ShipType.FIGHTER, 1);
    ships.addDamaged(ShipType.TRANSPORTER, 4);

    expect(formatFleetReportShips(ships)).toBe('Fighter x1, Transporter x3');
  });

  it('appends a stable fleet ships line to report body', () => {
    const ships = ManyShips.empty();
    ships.addUndamaged(ShipType.SPY_PROBE, 3);

    expect(appendFleetReportShips('Spy mission completed successfully.', ships))
      .toBe('Spy mission completed successfully.\nFleet ships: Spy Probe x3');
  });

  it('handles empty fleets', () => {
    expect(appendFleetReportShips('', ManyShips.empty())).toBe('Fleet ships: none');
  });
});
