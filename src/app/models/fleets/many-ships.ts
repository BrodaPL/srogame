import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ShipType } from '../enums/ship-type';
import { ShipInstance } from './ship-instance';

export type DamagedShipEntry = {
  type: ShipType;
  hull: number;
};

export type ShipSelectionEntry = {
  type: ShipType;
  undamagedAmount: number;
  damagedAmount: number;
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

  public undamagedCountByType(): Map<ShipType, number> {
    return ManyShips.undamagedCountByType(this);
  }

  public damagedCountByType(): Map<ShipType, number> {
    return ManyShips.damagedCountByType(this);
  }

  public totalCargoCapacity(): number {
    return ManyShips.totalCargoCapacity(this);
  }

  public totalHangarCapacity(): number {
    return ManyShips.totalHangarCapacity(this);
  }

  public totalTravelHangarCapacity(): number {
    return ManyShips.totalTravelHangarCapacity(this);
  }

  public totalRequiredHangarCapacity(): number {
    return ManyShips.totalRequiredHangarCapacity(this);
  }

  public isTravelHangarValid(): boolean {
    return ManyShips.isTravelHangarValid(this);
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

  public extractSelectedShips(requested: ShipSelectionEntry[]): ManyShips {
    const extractedShips = ManyShips.empty();

    for (const request of requested) {
      const undamagedAmount = Math.max(0, Math.floor(request.undamagedAmount));
      const damagedAmount = Math.max(0, Math.floor(request.damagedAmount));
      if (undamagedAmount <= 0 && damagedAmount <= 0) {
        continue;
      }

      const availableUndamaged = this.undamagedShipsCount[request.type] ?? 0;
      if (availableUndamaged < undamagedAmount) {
        throw new Error(`Not enough undamaged ships available for ${request.type}.`);
      }

      const availableDamaged = this.damagedShips.filter((entry) => entry.type === request.type).length;
      if (availableDamaged < damagedAmount) {
        throw new Error(`Not enough damaged ships available for ${request.type}.`);
      }

      if (undamagedAmount > 0) {
        const nextAmount = availableUndamaged - undamagedAmount;
        if (nextAmount > 0) {
          this.undamagedShipsCount[request.type] = nextAmount;
        } else {
          delete this.undamagedShipsCount[request.type];
        }
        extractedShips.addUndamaged(request.type, undamagedAmount);
      }

      if (damagedAmount > 0) {
        const remainingDamaged: DamagedShipEntry[] = [];
        let toExtract = damagedAmount;
        for (const entry of this.damagedShips) {
          if (entry.type === request.type && toExtract > 0) {
            extractedShips.addDamaged(entry.type, entry.hull);
            toExtract -= 1;
            continue;
          }

          remainingDamaged.push(entry);
        }

        this.damagedShips = remainingDamaged;
      }
    }

    return extractedShips;
  }

  public extractAnyShipsByType(requested: Array<{ type: ShipType; amount: number }>): ManyShips {
    const extractedShips = ManyShips.empty();

    for (const request of requested) {
      let remaining = Math.max(0, Math.floor(request.amount));
      if (remaining <= 0) {
        continue;
      }

      const remainingDamaged: DamagedShipEntry[] = [];
      for (const entry of this.damagedShips) {
        if (entry.type === request.type && remaining > 0) {
          extractedShips.addDamaged(entry.type, entry.hull);
          remaining -= 1;
          continue;
        }

        remainingDamaged.push(entry);
      }
      this.damagedShips = remainingDamaged;

      if (remaining <= 0) {
        continue;
      }

      const availableUndamaged = this.undamagedShipsCount[request.type] ?? 0;
      const extractedUndamagedAmount = Math.min(availableUndamaged, remaining);
      if (extractedUndamagedAmount > 0) {
        extractedShips.addUndamaged(request.type, extractedUndamagedAmount);
        const nextUndamagedAmount = availableUndamaged - extractedUndamagedAmount;
        if (nextUndamagedAmount > 0) {
          this.undamagedShipsCount[request.type] = nextUndamagedAmount;
        } else {
          delete this.undamagedShipsCount[request.type];
        }
      }
    }

    return extractedShips;
  }

  public trimNonJumpShipsToTravelHangarCapacity(): ManyShips {
    const removedShips = ManyShips.empty();
    let overflow = this.totalRequiredHangarCapacity() - this.totalTravelHangarCapacity();
    if (overflow <= 0) {
      return removedShips;
    }

    const damagedIndicesToRemove = this.damagedShips
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !ManyShips.canShipTravelIndependently(entry.type))
      .sort((left, right) => {
        const leftBlueprint = SHIP_BLUEPRINTS.get(left.entry.type);
        const rightBlueprint = SHIP_BLUEPRINTS.get(right.entry.type);
        const leftRatio = leftBlueprint && leftBlueprint.hullPointsCapacity > 0
          ? left.entry.hull / leftBlueprint.hullPointsCapacity
          : 0;
        const rightRatio = rightBlueprint && rightBlueprint.hullPointsCapacity > 0
          ? right.entry.hull / rightBlueprint.hullPointsCapacity
          : 0;
        if (leftRatio !== rightRatio) {
          return leftRatio - rightRatio;
        }

        const rightSize = rightBlueprint?.size ?? 0;
        const leftSize = leftBlueprint?.size ?? 0;
        if (leftSize !== rightSize) {
          return rightSize - leftSize;
        }

        return left.entry.type.localeCompare(right.entry.type);
      });

    const damagedRemovalIndices = new Set<number>();
    for (const candidate of damagedIndicesToRemove) {
      if (overflow <= 0) {
        break;
      }

      const blueprint = SHIP_BLUEPRINTS.get(candidate.entry.type);
      const shipSize = blueprint?.size ?? 0;
      if (shipSize <= 0) {
        continue;
      }

      damagedRemovalIndices.add(candidate.index);
      removedShips.addDamaged(candidate.entry.type, candidate.entry.hull);
      overflow -= shipSize;
    }

    if (damagedRemovalIndices.size > 0) {
      this.damagedShips = this.damagedShips.filter((_, index) => !damagedRemovalIndices.has(index));
    }

    if (overflow <= 0) {
      return removedShips;
    }

    const undamagedTypesByRemovalPriority = Object.entries(this.undamagedShipsCount)
      .map(([type, amount]) => ({
        type: type as ShipType,
        amount: Math.max(0, Math.floor(amount ?? 0)),
        size: SHIP_BLUEPRINTS.get(type as ShipType)?.size ?? 0
      }))
      .filter((entry) =>
        entry.amount > 0
        && entry.size > 0
        && !ManyShips.canShipTravelIndependently(entry.type)
      )
      .sort((left, right) => {
        if (left.size !== right.size) {
          return right.size - left.size;
        }

        return left.type.localeCompare(right.type);
      });

    for (const entry of undamagedTypesByRemovalPriority) {
      while (overflow > 0 && (this.undamagedShipsCount[entry.type] ?? 0) > 0) {
        this.undamagedShipsCount[entry.type] = (this.undamagedShipsCount[entry.type] ?? 0) - 1;
        if ((this.undamagedShipsCount[entry.type] ?? 0) <= 0) {
          delete this.undamagedShipsCount[entry.type];
        }

        removedShips.addUndamaged(entry.type, 1);
        overflow -= entry.size;
      }

      if (overflow <= 0) {
        break;
      }
    }

    return removedShips;
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

  public static undamagedCountByType(data: ManyShipsLike | null | undefined): Map<ShipType, number> {
    const normalized = ManyShips.fromData(data);
    const counts = new Map<ShipType, number>();

    for (const [type, amount] of Object.entries(normalized.undamagedShipsCount) as Array<[ShipType, number]>) {
      counts.set(type, Math.max(0, Math.floor(amount)));
    }

    return counts;
  }

  public static damagedCountByType(data: ManyShipsLike | null | undefined): Map<ShipType, number> {
    const normalized = ManyShips.fromData(data);
    const counts = new Map<ShipType, number>();

    for (const entry of normalized.damagedShips) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    }

    return counts;
  }

  public static totalCargoCapacity(data: ManyShipsLike | null | undefined): number {
    return ManyShips.totalCapacity(data, 'cargoCapacity');
  }

  public static totalHangarCapacity(data: ManyShipsLike | null | undefined): number {
    return ManyShips.totalCapacity(data, 'hangarCapacity');
  }

  public static totalTravelHangarCapacity(data: ManyShipsLike | null | undefined): number {
    const counts = ManyShips.countByType(data);
    let total = 0;
    for (const [type, amount] of counts.entries()) {
      const blueprint = SHIP_BLUEPRINTS.get(type);
      if (!blueprint || !blueprint.canJump || blueprint.hangarCapacity <= 0) {
        continue;
      }

      total += blueprint.hangarCapacity * amount;
    }

    return total;
  }

  public static totalRequiredHangarCapacity(data: ManyShipsLike | null | undefined): number {
    const counts = ManyShips.countByType(data);
    let total = 0;
    for (const [type, amount] of counts.entries()) {
      const blueprint = SHIP_BLUEPRINTS.get(type);
      if (!blueprint || blueprint.canJump || blueprint.size <= 0) {
        continue;
      }

      total += blueprint.size * amount;
    }

    return total;
  }

  public static isTravelHangarValid(data: ManyShipsLike | null | undefined): boolean {
    return ManyShips.totalRequiredHangarCapacity(data) <= ManyShips.totalTravelHangarCapacity(data);
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

  private static canShipTravelIndependently(type: ShipType): boolean {
    return SHIP_BLUEPRINTS.get(type)?.canJump ?? false;
  }
}
