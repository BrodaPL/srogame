import { describe, expect, it } from 'vitest';
import { BuildingBlueprintsFactory } from '../../../factories/building-blueprints.factory';
import { DefenceBlueprintsFactory } from '../../../factories/defence-blueprints.factory';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { BuildingQueueEntry } from '../../buildings/building-queue-entry';
import { BuildingType } from '../../enums/building-type';
import { DefenceType } from '../../enums/defence-type';
import { ShipType } from '../../enums/ship-type';
import { ShipyardQueueEntry } from '../../fleets/shipyard-queue-entry';
import {
  calculateBuildingCancellationRefund,
  calculateShipyardCancellation,
  moveQueueEntry
} from '../queue-management';

describe('queue-management', () => {
  it('moves queue entries without changing the entry instance', () => {
    const queue = [
      new BuildingQueueEntry(BuildingType.METAL_MINE, 1, 0),
      new BuildingQueueEntry(BuildingType.CRYSTAL_MINE, 1, 20),
      new BuildingQueueEntry(BuildingType.SHIPYARD, 1, 0)
    ];
    const movedEntry = queue[0];

    const changed = moveQueueEntry(queue, 0, 2);

    expect(changed).toBe(true);
    expect(queue[2]).toBe(movedEntry);
    expect(queue.map((entry) => entry.buildingType)).toEqual([
      BuildingType.CRYSTAL_MINE,
      BuildingType.SHIPYARD,
      BuildingType.METAL_MINE
    ]);
    expect(queue[2].investedIndustryPower).toBe(0);
  });

  it('returns full building cost when canceling an unstarted building queue entry', () => {
    const building = BuildingBlueprintsFactory.fromDefaultJson().get(BuildingType.METAL_MINE)!;
    const refund = calculateBuildingCancellationRefund(
      building,
      new BuildingQueueEntry(BuildingType.METAL_MINE, 2, 0)
    );

    const totalCost = building.getCostForLevel(2);
    expect(refund).toEqual(totalCost);
  });

  it('returns 75% of building cost when canceling a started building queue entry', () => {
    const building = BuildingBlueprintsFactory.fromDefaultJson().get(BuildingType.METAL_MINE)!;
    const refund = calculateBuildingCancellationRefund(
      building,
      new BuildingQueueEntry(BuildingType.METAL_MINE, 2, 25)
    );
    const totalCost = building.getCostForLevel(2);

    expect(refund.metal).toBe(Math.floor(totalCost.metal * 0.75));
    expect(refund.crystal).toBe(Math.floor(totalCost.crystal * 0.75));
    expect(refund.deuterium).toBe(Math.floor(totalCost.deuterium * 0.75));
  });

  it('returns full shipyard cost when canceling an unstarted stack', () => {
    const ship = ShipBlueprintsFactory.fromDefaultJson().get(ShipType.FIGHTER)!;
    const result = calculateShipyardCancellation(
      ship,
      ShipyardQueueEntry.ship(ShipType.FIGHTER, 4, 0)
    );

    expect(result.deliveredAmount).toBe(0);
    expect(result.refund.metal).toBe(ship.cost.metal * 4);
    expect(result.refund.crystal).toBe(ship.cost.crystal * 4);
    expect(result.refund.deuterium).toBe(ship.cost.deuterium * 4);
  });

  it('delivers completed ships and refunds 75% of unfinished stack cost when canceling a started stack', () => {
    const ship = ShipBlueprintsFactory.fromDefaultJson().get(ShipType.FIGHTER)!;
    const invested = (ship.cost.getTotalResourceAmount() * 2) + 15;
    const result = calculateShipyardCancellation(
      ship,
      ShipyardQueueEntry.ship(ShipType.FIGHTER, 5, invested)
    );

    expect(result.deliveredAmount).toBe(2);
    expect(result.refund.metal).toBe(Math.floor(ship.cost.metal * 3 * 0.75));
    expect(result.refund.crystal).toBe(Math.floor(ship.cost.crystal * 3 * 0.75));
    expect(result.refund.deuterium).toBe(Math.floor(ship.cost.deuterium * 3 * 0.75));
  });

  it('delivers completed defences and refunds 75% of the unfinished remainder', () => {
    const defence = DefenceBlueprintsFactory.fromDefaultJson().get(DefenceType.SAM_SITE)!;
    const invested = defence.cost.getTotalResourceAmount();
    const result = calculateShipyardCancellation(
      defence,
      ShipyardQueueEntry.defence(DefenceType.SAM_SITE, 3, invested)
    );

    expect(result.deliveredAmount).toBe(1);
    expect(result.refund.metal).toBe(Math.floor(defence.cost.metal * 2 * 0.75));
    expect(result.refund.crystal).toBe(Math.floor(defence.cost.crystal * 2 * 0.75));
    expect(result.refund.deuterium).toBe(Math.floor(defence.cost.deuterium * 2 * 0.75));
  });
});
