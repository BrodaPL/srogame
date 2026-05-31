import { describe, expect, it } from 'vitest';
import { ShipType } from '../enums/ship-type';
import { ManyShips } from '../fleets/many-ships';
import { appendFleetReportManifest, formatFleetReportCargo, formatFleetReportShips } from './fleet-report';

describe('fleet report ship formatting', () => {
  it('formats undamaged and damaged ships by type', () => {
    const ships = ManyShips.empty();
    ships.addUndamaged(ShipType.TRANSPORTER, 2);
    ships.addUndamaged(ShipType.FIGHTER, 1);
    ships.addDamaged(ShipType.TRANSPORTER, 4);

    expect(formatFleetReportShips(ships)).toBe('Fighter x1, Transporter x3');
  });

  it('formats cargo with stable resource labels', () => {
    expect(formatFleetReportCargo({ metal: 120, crystal: 30.8, deuterium: -5 }))
      .toBe('Metal 120, Crystal 30, Deuterium 0');
  });

  it('appends stable fleet ships and cargo lines to report body', () => {
    const ships = ManyShips.empty();
    ships.addUndamaged(ShipType.SPY_PROBE, 3);

    expect(appendFleetReportManifest('Spy mission completed successfully.', ships, { metal: 1, crystal: 2, deuterium: 3 }))
      .toBe('Spy mission completed successfully.\nFleet ships: Spy Probe x3\nFleet cargo: Metal 1, Crystal 2, Deuterium 3');
  });

  it('handles empty fleets', () => {
    expect(appendFleetReportManifest('', ManyShips.empty(), null))
      .toBe('Fleet ships: none\nFleet cargo: Metal 0, Crystal 0, Deuterium 0');
  });
});
