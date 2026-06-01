import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ShipType } from '../enums/ship-type';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const BASE_DEUTERIUM_COST_PER_JUMP_SHIP = 10;

export type JumpGateTravelShipSelection = {
  type: ShipType;
  amount: number;
};

export function countJumpGateChargedShips(ships: JumpGateTravelShipSelection[] = []): number {
  let count = 0;
  for (const entry of ships) {
    const amount = Math.max(0, Math.floor(entry.amount));
    if (amount <= 0 || entry.type === ShipType.SPY_PROBE) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(entry.type);
    if (!blueprint?.canJump) {
      continue;
    }

    count += amount;
  }

  return count;
}

export function jumpGateTravelCostMultiplier(
  hyperspaceTechnologyLevel: number,
  hyperspaceDriveLevel: number,
  jumpGateLevel: number
): number {
  const discountPercent = (
    sanitizeLevel(hyperspaceTechnologyLevel) * 2
    + sanitizeLevel(hyperspaceDriveLevel)
    + Math.max(0, sanitizeLevel(jumpGateLevel) - 1) * 5
  );

  return Math.max(0, 1 - (discountPercent / 100));
}

export function calculateJumpGateTravelCost(
  ships: JumpGateTravelShipSelection[] = [],
  hyperspaceTechnologyLevel: number,
  hyperspaceDriveLevel: number,
  jumpGateLevel: number
): number {
  const chargedShips = countJumpGateChargedShips(ships);
  if (chargedShips <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      chargedShips
      * BASE_DEUTERIUM_COST_PER_JUMP_SHIP
      * jumpGateTravelCostMultiplier(hyperspaceTechnologyLevel, hyperspaceDriveLevel, jumpGateLevel)
    )
  );
}

function sanitizeLevel(level: number): number {
  return Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
}
