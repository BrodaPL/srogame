import { DiplomaticStatus } from './diplomatic-status';

export function isDiplomaticProposalRequestedStatus(status: DiplomaticStatus): boolean {
  return status === DiplomaticStatus.PEACE || status === DiplomaticStatus.ALLIED;
}

export function allowedDiplomaticProposalStatuses(currentStatus: DiplomaticStatus): DiplomaticStatus[] {
  switch (currentStatus) {
    case DiplomaticStatus.NEUTRAL:
    case DiplomaticStatus.WAR:
      return [DiplomaticStatus.PEACE];
    case DiplomaticStatus.PEACE:
      return [DiplomaticStatus.ALLIED];
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
