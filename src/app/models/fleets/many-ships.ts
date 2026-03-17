import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ShipType } from '../enums/ship-type';
import { ShipInstance } from './ship-instance';

export type DamagedShipEntry = {
  type: ShipType;
  hull: number;
};

export type ManyShipsLike = {
  undamagedShipsCount: Partial<Record<ShipType, number>>;
  damagedShips: DamagedShipEntry[];
};

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export class ManyShips implements ManyShipsLike {
  constructor(
    public undamagedShipsCount: Partial<Record<ShipType, number>> = {},
    public damagedShips: DamagedShipEntry[] = []
  ) {}

  public static empty(): ManyShips {
    return new ManyShips();
  }

  public static fromData(data: ManyShipsLike | null | undefined): ManyShips {
    if (!data) {
      return ManyShips.empty();
    }

    return new ManyShips(
      { ...(data.undamagedShipsCount ?? {}) },
      (data.damagedShips ?? [])
        .filter((entry) => Number.isFinite(entry.hull) && entry.hull > 0)
        .map((entry) => ({ type: entry.type, hull: entry.hull }))
    );
  }

  public static fromShipInstances(ships: ShipInstance[]): ManyShips {
    const manyShips = ManyShips.empty();
    for (const ship of ships) {
      if (ship.hull >= ship.type.hullPointsCapacity) {
        manyShips.addUndamaged(ship.type.type, 1);
        continue;
      }

      manyShips.addDamaged(ship.type.type, ship.hull);
    }

    return manyShips;
  }

  public totalShipsCount(): number {
    return ManyShips.totalShipsCount(this);
  }

  public countByType(): Map<ShipType, number> {
    return ManyShips.countByType(this);
  }

  public totalCargoCapacity(): number {
    return ManyShips.totalCargoCapacity(this);
  }

  public totalHangarCapacity(): number {
    return ManyShips.totalHangarCapacity(this);
  }

  public addUndamaged(type: ShipType, amount = 1): void {
    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (normalizedAmount <= 0) {
      return;
    }

    this.undamagedShipsCount[type] = (this.undamagedShipsCount[type] ?? 0) + normalizedAmount;
  }

  public addDamaged(type: ShipType, hull: number): void {
    if (!Number.isFinite(hull) || hull <= 0) {
      return;
    }

    this.damagedShips.push({
      type,
      hull
    });
  }

  public addManyShips(other: ManyShipsLike): void {
    const source = ManyShips.fromData(other);
    for (const [type, amount] of Object.entries(source.undamagedShipsCount) as Array<[ShipType, number]>) {
      this.addUndamaged(type, amount);
    }

    for (const damaged of source.damagedShips) {
      this.addDamaged(damaged.type, damaged.hull);
    }
  }

  public toShipInstances(): ShipInstance[] {
    return ManyShips.toShipInstances(this);
  }

  public removeShipsByType(requested: Array<{ type: ShipType; amount: number }>): void {
    for (const request of requested) {
      let remaining = Math.max(0, Math.floor(request.amount));
      if (remaining <= 0) {
        continue;
      }

      const damagedToKeep: DamagedShipEntry[] = [];
      for (const damaged of this.damagedShips) {
        if (damaged.type === request.type && remaining > 0) {
          remaining -= 1;
          continue;
        }

        damagedToKeep.push(damaged);
      }
      this.damagedShips = damagedToKeep;

      if (remaining <= 0) {
        continue;
      }

      const undamagedAmount = this.undamagedShipsCount[request.type] ?? 0;
      const nextUndamagedAmount = Math.max(0, undamagedAmount - remaining);
      if (nextUndamagedAmount > 0) {
        this.undamagedShipsCount[request.type] = nextUndamagedAmount;
      } else {
        delete this.undamagedShipsCount[request.type];
      }
    }
  }

  public undamagedPercentage(): number {
    return ManyShips.undamagedPercentage(this);
  }

  public damagedPercentage(): number {
    return ManyShips.damagedPercentage(this);
  }

  public groupedUndamagedEntries(): Array<{ type: ShipType; amount: number }> {
    return ManyShips.groupedUndamagedEntries(this);
  }

  public groupedDamagedEntries(): Array<{
    type: ShipType;
    amount: number;
    totalMissingHull: number;
    averageDamagePercent: number;
  }> {
    return ManyShips.groupedDamagedEntries(this);
  }

  public static totalShipsCount(data: ManyShipsLike | null | undefined): number {
    const normalized = ManyShips.fromData(data);
    let total = normalized.damagedShips.length;
    for (const amount of Object.values(normalized.undamagedShipsCount)) {
      total += Math.max(0, Math.floor(amount ?? 0));
    }

    return total;
  }

  public static countByType(data: ManyShipsLike | null | undefined): Map<ShipType, number> {
    const normalized = ManyShips.fromData(data);
    const counts = new Map<ShipType, number>();

    for (const [type, amount] of Object.entries(normalized.undamagedShipsCount) as Array<[ShipType, number]>) {
      counts.set(type, (counts.get(type) ?? 0) + Math.max(0, Math.floor(amount)));
    }

    for (const damaged of normalized.damagedShips) {
      counts.set(damaged.type, (counts.get(damaged.type) ?? 0) + 1);
    }

    return counts;
  }

  public static totalCargoCapacity(data: ManyShipsLike | null | undefined): number {
    return ManyShips.totalCapacity(data, 'cargoCapacity');
  }

  public static totalHangarCapacity(data: ManyShipsLike | null | undefined): number {
    return ManyShips.totalCapacity(data, 'hangarCapacity');
  }

  public static toShipInstances(data: ManyShipsLike | null | undefined): ShipInstance[] {
    const normalized = ManyShips.fromData(data);
    const instances: ShipInstance[] = [];

    for (const [type, amount] of Object.entries(normalized.undamagedShipsCount) as Array<[ShipType, number]>) {
      const blueprint = SHIP_BLUEPRINTS.get(type);
      if (!blueprint) {
        continue;
      }

      for (let index = 0; index < Math.max(0, Math.floor(amount)); index += 1) {
        instances.push(new ShipInstance(
          blueprint,
          blueprint.hullPointsCapacity,
          blueprint.shieldCapacity,
          0,
          []
        ));
      }
    }

    for (const damaged of normalized.damagedShips) {
      const blueprint = SHIP_BLUEPRINTS.get(damaged.type);
      if (!blueprint) {
        continue;
      }

      instances.push(new ShipInstance(
        blueprint,
        Math.max(0, Math.min(blueprint.hullPointsCapacity, damaged.hull)),
        blueprint.shieldCapacity,
        0,
        []
      ));
    }

    return instances;
  }

  public static undamagedPercentage(data: ManyShipsLike | null | undefined): number {
    const normalized = ManyShips.fromData(data);
    const total = ManyShips.totalShipsCount(normalized);
    if (total <= 0) {
      return 0;
    }

    const undamaged = Object.values(normalized.undamagedShipsCount)
      .reduce((sum, amount) => sum + Math.max(0, Math.floor(amount ?? 0)), 0);
    return Math.round((undamaged / total) * 100);
  }

  public static damagedPercentage(data: ManyShipsLike | null | undefined): number {
    const total = ManyShips.totalShipsCount(data);
    if (total <= 0) {
      return 0;
    }

    return Math.max(0, 100 - ManyShips.undamagedPercentage(data));
  }

  public static groupedUndamagedEntries(
    data: ManyShipsLike | null | undefined
  ): Array<{ type: ShipType; amount: number }> {
    const normalized = ManyShips.fromData(data);
    return Object.entries(normalized.undamagedShipsCount)
      .map(([type, amount]) => ({
        type: type as ShipType,
        amount: Math.max(0, Math.floor(amount ?? 0))
      }))
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => left.type.localeCompare(right.type));
  }

  public static groupedDamagedEntries(
    data: ManyShipsLike | null | undefined
  ): Array<{
    type: ShipType;
    amount: number;
    totalMissingHull: number;
    averageDamagePercent: number;
  }> {
    const normalized = ManyShips.fromData(data);
    const grouped = new Map<ShipType, { amount: number; totalMissingHull: number; totalDamagePercent: number }>();

    for (const damaged of normalized.damagedShips) {
      const blueprint = SHIP_BLUEPRINTS.get(damaged.type);
      if (!blueprint) {
        continue;
      }

      const missingHull = Math.max(0, blueprint.hullPointsCapacity - damaged.hull);
      const damagePercent = blueprint.hullPointsCapacity <= 0
        ? 0
        : (missingHull / blueprint.hullPointsCapacity) * 100;
      const current = grouped.get(damaged.type) ?? {
        amount: 0,
        totalMissingHull: 0,
        totalDamagePercent: 0
      };
      current.amount += 1;
      current.totalMissingHull += missingHull;
      current.totalDamagePercent += damagePercent;
      grouped.set(damaged.type, current);
    }

    return [...grouped.entries()]
      .map(([type, value]) => ({
        type,
        amount: value.amount,
        totalMissingHull: Math.round(value.totalMissingHull),
        averageDamagePercent: value.amount <= 0 ? 0 : Math.round(value.totalDamagePercent / value.amount)
      }))
      .sort((left, right) => left.type.localeCompare(right.type));
  }

  private static totalCapacity(
    data: ManyShipsLike | null | undefined,
    key: 'cargoCapacity' | 'hangarCapacity'
  ): number {
    const counts = ManyShips.countByType(data);
    let total = 0;
    for (const [type, amount] of counts.entries()) {
      const blueprint = SHIP_BLUEPRINTS.get(type);
      if (!blueprint) {
        continue;
      }

      total += blueprint[key] * amount;
    }

    return total;
  }
}
