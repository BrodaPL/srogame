import { DiplomaticStatus } from './diplomatic-status';

export type DiplomacyVisualKey =
  | 'self'
  | 'war'
  | 'neutral'
  | 'peace'
  | 'allied';

export function diplomacyStatusLabel(status: DiplomaticStatus): string {
  if (status === DiplomaticStatus.PASSIVE) {
    return DiplomaticStatus.NEUTRAL;
  }

  return status;
}

export function diplomacyVisualKey(status: DiplomaticStatus): DiplomacyVisualKey {
  switch (status) {
    case DiplomaticStatus.SELF:
      return 'self';
    case DiplomaticStatus.WAR:
      return 'war';
    case DiplomaticStatus.ALLIED:
      return 'allied';
    case DiplomaticStatus.PEACE:
      return 'peace';
    case DiplomaticStatus.PASSIVE:
    case DiplomaticStatus.NEUTRAL:
    default:
      return 'neutral';
  }
}

export function ownerLabelWithDiplomacy(ownerName: string, status: DiplomaticStatus | null): string {
  return status ? `${ownerName} (${diplomacyStatusLabel(status)})` : ownerName;
}
