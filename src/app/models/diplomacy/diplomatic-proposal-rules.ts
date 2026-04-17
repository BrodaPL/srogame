import { DiplomaticStatus } from './diplomatic-status';

export function isDiplomaticProposalRequestedStatus(status: DiplomaticStatus): boolean {
  return status === DiplomaticStatus.PEACE
    || status === DiplomaticStatus.ALLIED
    || status === DiplomaticStatus.NEUTRAL
    || status === DiplomaticStatus.WAR;
}

export function allowedDiplomaticProposalStatuses(currentStatus: DiplomaticStatus): DiplomaticStatus[] {
  switch (currentStatus) {
    case DiplomaticStatus.NEUTRAL:
      return [DiplomaticStatus.PEACE, DiplomaticStatus.WAR];
    case DiplomaticStatus.WAR:
      return [DiplomaticStatus.PEACE, DiplomaticStatus.NEUTRAL];
    case DiplomaticStatus.PEACE:
      return [DiplomaticStatus.ALLIED, DiplomaticStatus.NEUTRAL];
    case DiplomaticStatus.ALLIED:
      return [DiplomaticStatus.PEACE];
    default:
      return [];
  }
}

export function canCreateDiplomaticProposalForStatus(
  currentStatus: DiplomaticStatus,
  requestedStatus: DiplomaticStatus
): boolean {
  return allowedDiplomaticProposalStatuses(currentStatus).includes(requestedStatus);
}
