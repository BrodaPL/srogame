import { DiplomaticStatus } from './diplomatic-status';

export type DiplomaticRelation = {
  playerAId: number;
  playerBId: number;
  status: DiplomaticStatus;
};

export function normalizeDiplomaticPair(
  leftPlayerId: number,
  rightPlayerId: number
): { playerAId: number; playerBId: number } {
  return {
    playerAId: Math.min(leftPlayerId, rightPlayerId),
    playerBId: Math.max(leftPlayerId, rightPlayerId)
  };
}

export function createDiplomaticRelation(
  leftPlayerId: number,
  rightPlayerId: number,
  status: DiplomaticStatus
): DiplomaticRelation {
  const pair = normalizeDiplomaticPair(leftPlayerId, rightPlayerId);
  return {
    playerAId: pair.playerAId,
    playerBId: pair.playerBId,
    status
  };
}
