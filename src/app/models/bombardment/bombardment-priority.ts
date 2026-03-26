import { BuildingType } from '../enums/building-type';
import { FleetMissionType } from '../enums/fleet-mission-type';

export enum BombardmentPriorityTarget {
  DEFENCES = 'DEFENCES',
  DEFENCES_CAN_SHOOT_TO_ORBIT = 'DEFENCES_CAN_SHOOT_TO_ORBIT',
  DEFENCES_CANNOT_SHOOT_TO_ORBIT = 'DEFENCES_CANNOT_SHOOT_TO_ORBIT',
  RESOURCE_BUILDINGS = 'RESOURCE_BUILDINGS',
  FACILITIES = 'FACILITIES'
}

export type BombardmentPrioritySelection = BombardmentPriorityTarget | BuildingType;

export type BombardmentPriorities = {
  main: BombardmentPrioritySelection | null;
  secondary: BombardmentPrioritySelection | null;
  tertiary: BombardmentPrioritySelection | null;
};

export function emptyBombardmentPriorities(): BombardmentPriorities {
  return {
    main: null,
    secondary: null,
    tertiary: null
  };
}

export function hasAnyBombardmentPriority(priorities: BombardmentPriorities | null | undefined): boolean {
  if (!priorities) {
    return false;
  }

  return !!priorities.main || !!priorities.secondary || !!priorities.tertiary;
}

export function normalizeBombardmentPriorities(
  priorities: Partial<BombardmentPriorities> | null | undefined
): BombardmentPriorities {
  const normalized = {
    main: isBombardmentPrioritySelection(priorities?.main) ? priorities.main : null,
    secondary: isBombardmentPrioritySelection(priorities?.secondary) ? priorities.secondary : null,
    tertiary: isBombardmentPrioritySelection(priorities?.tertiary) ? priorities.tertiary : null
  } satisfies BombardmentPriorities;

  const used = new Set<BombardmentPrioritySelection>();
  for (const slot of ['main', 'secondary', 'tertiary'] as const) {
    const value = normalized[slot];
    if (!value) {
      continue;
    }

    if (used.has(value)) {
      normalized[slot] = null;
      continue;
    }

    used.add(value);
  }

  return normalized;
}

export function isBombardmentPrioritySelection(value: unknown): value is BombardmentPrioritySelection {
  return isBombardmentPriorityTarget(value) || Object.values(BuildingType).includes(value as BuildingType);
}

export function isBombardmentPriorityTarget(value: unknown): value is BombardmentPriorityTarget {
  return Object.values(BombardmentPriorityTarget).includes(value as BombardmentPriorityTarget);
}

export function bombardmentPriorityChances(missionType: FleetMissionType): [number, number, number] {
  if (missionType === FleetMissionType.SIEGE) {
    return [0.15, 0.10, 0.05];
  }

  return [0.20, 0.15, 0.10];
}

export function bombardmentPriorityLabel(priority: BombardmentPrioritySelection | null | undefined): string {
  if (!priority) {
    return 'Random';
  }

  switch (priority) {
    case BombardmentPriorityTarget.DEFENCES:
      return 'Defences';
    case BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT:
      return 'Defences canShootToOrbit=true';
    case BombardmentPriorityTarget.DEFENCES_CANNOT_SHOOT_TO_ORBIT:
      return 'Defences canShootToOrbit=false';
    case BombardmentPriorityTarget.RESOURCE_BUILDINGS:
      return 'Resource buildings';
    case BombardmentPriorityTarget.FACILITIES:
      return 'Facilities';
    default:
      return priority;
  }
}
