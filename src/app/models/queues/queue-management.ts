import { Building } from '../buildings/building';
import { BuildingQueueEntry } from '../buildings/building-queue-entry';
import { Defence } from '../defences/defence';
import { Ship } from '../fleets/ship';
import { ShipyardQueueEntry } from '../fleets/shipyard-queue-entry';
import { ResourcesPack } from '../resources-pack';

export type ShipyardCancellationResult = {
  deliveredAmount: number;
  refund: ResourcesPack;
};

export function moveQueueEntry<T>(queue: T[], fromIndex: number, toIndex: number): boolean {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return false;
  }

  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= queue.length
    || toIndex >= queue.length
    || fromIndex === toIndex
  ) {
    return false;
  }

  const [entry] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, entry);
  return true;
}

export function calculateBuildingCancellationRefund(
  building: Building,
  entry: BuildingQueueEntry
): ResourcesPack {
  const totalCost = building.getCostForLevel(entry.nextLevel);
  if (normalizedInvested(entry.investedIndustryPower) <= 0) {
    return copyResources(totalCost);
  }

  return scaleResources(totalCost, 0.75);
}

export function calculateShipyardCancellation(
  blueprint: Ship | Defence,
  entry: ShipyardQueueEntry
): ShipyardCancellationResult {
  const amount = Math.max(0, Math.floor(entry.amount));
  if (amount <= 0) {
    return {
      deliveredAmount: 0,
      refund: new ResourcesPack(0, 0, 0)
    };
  }

  const invested = normalizedInvested(entry.investedShipyardPower);
  if (invested <= 0) {
    return {
      deliveredAmount: 0,
      refund: multiplyResources(blueprint.cost, amount)
    };
  }

  const singleCost = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
  const deliveredAmount = singleCost <= 0
    ? amount
    : Math.min(amount, Math.floor(invested / singleCost));
  const unfinishedAmount = Math.max(0, amount - deliveredAmount);

  return {
    deliveredAmount,
    refund: scaleResources(multiplyResources(blueprint.cost, unfinishedAmount), 0.75)
  };
}

function copyResources(pack: ResourcesPack): ResourcesPack {
  return new ResourcesPack(pack.metal, pack.crystal, pack.deuterium);
}

function multiplyResources(pack: ResourcesPack, amount: number): ResourcesPack {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  return new ResourcesPack(
    pack.metal * normalizedAmount,
    pack.crystal * normalizedAmount,
    pack.deuterium * normalizedAmount
  );
}

function scaleResources(pack: ResourcesPack, factor: number): ResourcesPack {
  const normalizedFactor = Number.isFinite(factor) ? factor : 0;
  return new ResourcesPack(
    Math.floor(pack.metal * normalizedFactor),
    Math.floor(pack.crystal * normalizedFactor),
    Math.floor(pack.deuterium * normalizedFactor)
  );
}

function normalizedInvested(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
