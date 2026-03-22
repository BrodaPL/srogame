import { DefenceBlueprintsFactory } from '../../factories/defence-blueprints.factory';
import { DefenceType } from '../enums/defence-type';
import { DefenceInstance } from './defence-instance';

export type DamagedDefenceEntry = {
  type: DefenceType;
  hull: number;
};

export type DefenceSelectionEntry = {
  type: DefenceType;
  undamagedAmount: number;
  damagedAmount: number;
};

export type DefenceAmountRequest = {
  type: DefenceType;
  amount: number;
};

export type ManyDefencesLike = {
  undamagedDefencesCount: Partial<Record<DefenceType, number>>;
  damagedDefences: DamagedDefenceEntry[];
};

const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();

export class ManyDefences implements ManyDefencesLike {
  constructor(
    public undamagedDefencesCount: Partial<Record<DefenceType, number>> = {},
    public damagedDefences: DamagedDefenceEntry[] = []
  ) {}

  public static empty(): ManyDefences {
    return new ManyDefences();
  }

  public static fromData(data: ManyDefencesLike | null | undefined): ManyDefences {
    if (!data) {
      return ManyDefences.empty();
    }

    return new ManyDefences(
      { ...(data.undamagedDefencesCount ?? {}) },
      (data.damagedDefences ?? [])
        .filter((entry) => Number.isFinite(entry.hull) && entry.hull > 0)
        .map((entry) => ({ type: entry.type, hull: entry.hull }))
    );
  }

  public static fromDefenceInstances(defences: DefenceInstance[]): ManyDefences {
    const manyDefences = ManyDefences.empty();
    for (const defence of defences) {
      if (defence.hull >= defence.type.hullPointsCapacity) {
        manyDefences.addUndamaged(defence.type.type, 1);
        continue;
      }

      manyDefences.addDamaged(defence.type.type, defence.hull);
    }

    return manyDefences;
  }

  public totalDefencesCount(): number {
    return ManyDefences.totalDefencesCount(this);
  }

  public countByType(): Map<DefenceType, number> {
    return ManyDefences.countByType(this);
  }

  public undamagedCountByType(): Map<DefenceType, number> {
    return ManyDefences.undamagedCountByType(this);
  }

  public damagedCountByType(): Map<DefenceType, number> {
    return ManyDefences.damagedCountByType(this);
  }

  public addUndamaged(type: DefenceType, amount = 1): void {
    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (normalizedAmount <= 0) {
      return;
    }

    this.undamagedDefencesCount[type] = (this.undamagedDefencesCount[type] ?? 0) + normalizedAmount;
  }

  public addDamaged(type: DefenceType, hull: number): void {
    if (!Number.isFinite(hull) || hull <= 0) {
      return;
    }

    this.damagedDefences.push({
      type,
      hull
    });
  }

  public addManyDefences(other: ManyDefencesLike): void {
    const source = ManyDefences.fromData(other);
    for (const [type, amount] of Object.entries(source.undamagedDefencesCount) as Array<[DefenceType, number]>) {
      this.addUndamaged(type, amount);
    }

    for (const damaged of source.damagedDefences) {
      this.addDamaged(damaged.type, damaged.hull);
    }
  }

  public toDefenceInstances(): DefenceInstance[] {
    return ManyDefences.toDefenceInstances(this);
  }

  public extractAnyDefencesByType(requested: DefenceAmountRequest[]): ManyDefences {
    const extractedDefences = ManyDefences.empty();

    for (const request of requested) {
      let remaining = Math.max(0, Math.floor(request.amount));
      if (remaining <= 0) {
        continue;
      }

      const remainingDamaged: DamagedDefenceEntry[] = [];
      for (const entry of this.damagedDefences) {
        if (entry.type === request.type && remaining > 0) {
          extractedDefences.addDamaged(entry.type, entry.hull);
          remaining -= 1;
          continue;
        }

        remainingDamaged.push(entry);
      }
      this.damagedDefences = remainingDamaged;

      if (remaining <= 0) {
        continue;
      }

      const availableUndamaged = this.undamagedDefencesCount[request.type] ?? 0;
      const extractedUndamagedAmount = Math.min(availableUndamaged, remaining);
      if (extractedUndamagedAmount > 0) {
        extractedDefences.addUndamaged(request.type, extractedUndamagedAmount);
        const nextUndamagedAmount = availableUndamaged - extractedUndamagedAmount;
        if (nextUndamagedAmount > 0) {
          this.undamagedDefencesCount[request.type] = nextUndamagedAmount;
        } else {
          delete this.undamagedDefencesCount[request.type];
        }
      }
    }

    return extractedDefences;
  }

  public hasDamagedDefences(): boolean {
    return ManyDefences.hasDamagedDefences(this);
  }

  public totalMissingHull(): number {
    return ManyDefences.totalMissingHull(this);
  }

  public repairDamagedDefenceAtIndex(index: number, repairAmount: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.damagedDefences.length) {
      return 0;
    }

    const normalizedRepairAmount = Math.max(0, Math.floor(repairAmount));
    if (normalizedRepairAmount <= 0) {
      return 0;
    }

    const damagedDefence = this.damagedDefences[index];
    const blueprint = DEFENCE_BLUEPRINTS.get(damagedDefence.type);
    if (!blueprint) {
      return 0;
    }

    const missingHull = Math.max(0, blueprint.hullPointsCapacity - damagedDefence.hull);
    if (missingHull <= 0) {
      return 0;
    }

    const usedRepair = Math.min(normalizedRepairAmount, missingHull);
    damagedDefence.hull = Math.min(blueprint.hullPointsCapacity, damagedDefence.hull + usedRepair);
    return usedRepair;
  }

  public normalizeFullyRepairedDefences(): number {
    let repairedToUndamaged = 0;
    const remainingDamaged: DamagedDefenceEntry[] = [];

    for (const entry of this.damagedDefences) {
      const blueprint = DEFENCE_BLUEPRINTS.get(entry.type);
      if (!blueprint) {
        remainingDamaged.push(entry);
        continue;
      }

      if (entry.hull >= blueprint.hullPointsCapacity) {
        this.addUndamaged(entry.type, 1);
        repairedToUndamaged += 1;
        continue;
      }

      remainingDamaged.push(entry);
    }

    this.damagedDefences = remainingDamaged;
    return repairedToUndamaged;
  }

  public groupedUndamagedEntries(): Array<{ type: DefenceType; amount: number }> {
    return ManyDefences.groupedUndamagedEntries(this);
  }

  public groupedDamagedEntries(): Array<{
    type: DefenceType;
    amount: number;
    totalMissingHull: number;
    averageDamagePercent: number;
  }> {
    return ManyDefences.groupedDamagedEntries(this);
  }

  public static totalDefencesCount(data: ManyDefencesLike | null | undefined): number {
    const normalized = ManyDefences.fromData(data);
    let total = normalized.damagedDefences.length;
    for (const amount of Object.values(normalized.undamagedDefencesCount)) {
      total += Math.max(0, Math.floor(amount ?? 0));
    }

    return total;
  }

  public static countByType(data: ManyDefencesLike | null | undefined): Map<DefenceType, number> {
    const normalized = ManyDefences.fromData(data);
    const counts = new Map<DefenceType, number>();

    for (const [type, amount] of Object.entries(normalized.undamagedDefencesCount) as Array<[DefenceType, number]>) {
      counts.set(type, (counts.get(type) ?? 0) + Math.max(0, Math.floor(amount)));
    }

    for (const damaged of normalized.damagedDefences) {
      counts.set(damaged.type, (counts.get(damaged.type) ?? 0) + 1);
    }

    return counts;
  }

  public static undamagedCountByType(data: ManyDefencesLike | null | undefined): Map<DefenceType, number> {
    const normalized = ManyDefences.fromData(data);
    const counts = new Map<DefenceType, number>();

    for (const [type, amount] of Object.entries(normalized.undamagedDefencesCount) as Array<[DefenceType, number]>) {
      counts.set(type, Math.max(0, Math.floor(amount)));
    }

    return counts;
  }

  public static damagedCountByType(data: ManyDefencesLike | null | undefined): Map<DefenceType, number> {
    const normalized = ManyDefences.fromData(data);
    const counts = new Map<DefenceType, number>();

    for (const entry of normalized.damagedDefences) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    }

    return counts;
  }

  public static toDefenceInstances(data: ManyDefencesLike | null | undefined): DefenceInstance[] {
    const normalized = ManyDefences.fromData(data);
    const instances: DefenceInstance[] = [];

    for (const [type, amount] of Object.entries(normalized.undamagedDefencesCount) as Array<[DefenceType, number]>) {
      const blueprint = DEFENCE_BLUEPRINTS.get(type);
      if (!blueprint) {
        continue;
      }

      for (let index = 0; index < Math.max(0, Math.floor(amount)); index += 1) {
        instances.push(new DefenceInstance(
          blueprint,
          blueprint.hullPointsCapacity,
          blueprint.shieldCapacity
        ));
      }
    }

    for (const damaged of normalized.damagedDefences) {
      const blueprint = DEFENCE_BLUEPRINTS.get(damaged.type);
      if (!blueprint) {
        continue;
      }

      instances.push(new DefenceInstance(
        blueprint,
        Math.max(0, Math.min(blueprint.hullPointsCapacity, damaged.hull)),
        blueprint.shieldCapacity
      ));
    }

    return instances;
  }

  public static hasDamagedDefences(data: ManyDefencesLike | null | undefined): boolean {
    return ManyDefences.fromData(data).damagedDefences.length > 0;
  }

  public static totalMissingHull(data: ManyDefencesLike | null | undefined): number {
    const normalized = ManyDefences.fromData(data);
    let total = 0;

    for (const damaged of normalized.damagedDefences) {
      const blueprint = DEFENCE_BLUEPRINTS.get(damaged.type);
      if (!blueprint) {
        continue;
      }

      total += Math.max(0, blueprint.hullPointsCapacity - damaged.hull);
    }

    return total;
  }

  public static groupedUndamagedEntries(
    data: ManyDefencesLike | null | undefined
  ): Array<{ type: DefenceType; amount: number }> {
    const normalized = ManyDefences.fromData(data);
    return Object.entries(normalized.undamagedDefencesCount)
      .map(([type, amount]) => ({
        type: type as DefenceType,
        amount: Math.max(0, Math.floor(amount ?? 0))
      }))
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => left.type.localeCompare(right.type));
  }

  public static groupedDamagedEntries(
    data: ManyDefencesLike | null | undefined
  ): Array<{
    type: DefenceType;
    amount: number;
    totalMissingHull: number;
    averageDamagePercent: number;
  }> {
    const normalized = ManyDefences.fromData(data);
    const grouped = new Map<DefenceType, { amount: number; totalMissingHull: number; totalDamagePercent: number }>();

    for (const damaged of normalized.damagedDefences) {
      const blueprint = DEFENCE_BLUEPRINTS.get(damaged.type);
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
}
