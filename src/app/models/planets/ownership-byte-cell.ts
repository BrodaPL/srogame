import { PlayerType } from '../enums/player-type';
import type { SolarSystem } from './solar-system';
import { DiplomaticStatus } from '../diplomacy/diplomatic-status';

export type RelationOwnershipTuple = [number, number, number, number, number, number];

// Contains ownership data about the StarSystem based ONLY on thePlayer EspionageReportData's about this StarSystem.
export class OwnershipByteCell {
  public ownership: Int8Array;
  public relationOwnership: Int8Array;

  constructor(
    ownedByPlayer: number,
    neutralOwned: number,
    botOwned: number,
    humanOwned: number,
    relationOwnership: RelationOwnershipTuple = [0, neutralOwned, 0, 0, 0, 0]
  ) {
    this.ownership = new Int8Array(4);
    this.ownership[0] = ownedByPlayer;
    this.ownership[1] = neutralOwned;
    this.ownership[2] = botOwned;
    this.ownership[3] = humanOwned;
    this.relationOwnership = new Int8Array(6);
    for (let index = 0; index < relationOwnership.length; index += 1) {
      this.relationOwnership[index] = relationOwnership[index];
    }
  }

  public static fromSolarSystem(
    system: SolarSystem,
    playerId: number,
    playerTypeById: Map<number, PlayerType>,
    resolveDiplomaticStatus: (leftOwnerId: number, rightOwnerId: number) => DiplomaticStatus = (leftOwnerId, rightOwnerId) =>
      leftOwnerId === rightOwnerId ? DiplomaticStatus.SELF : DiplomaticStatus.NEUTRAL
  ): OwnershipByteCell | null {
    let ownedByPlayer = 0;
    let neutralOwned = 0;
    let botOwned = 0;
    let humanOwned = 0;
    const relationOwnership: RelationOwnershipTuple = [0, 0, 0, 0, 0, 0];
    let hasAnyReportData = false;

    for (const planet of system.planets) {
      const reportData = planet.lastReportData.get(playerId);
      if (!reportData) {
        continue;
      }
      hasAnyReportData = true;

      const ownerId = planet.info.ownerId;
      if (ownerId === playerId) {
        ownedByPlayer += 1;
        relationOwnership[0] += 1;
        continue;
      }

      if (ownerId === null) {
        neutralOwned += 1;
        relationOwnership[1] += 1;
        continue;
      }

      const ownerType = playerTypeById.get(ownerId);
      if (ownerType === PlayerType.BOT) {
        botOwned += 1;
        this.addDiplomaticRelationCount(relationOwnership, resolveDiplomaticStatus(playerId, ownerId));
      } else if (ownerType === PlayerType.PLAYER) {
        humanOwned += 1;
        this.addDiplomaticRelationCount(relationOwnership, resolveDiplomaticStatus(playerId, ownerId));
      } else {
        neutralOwned += 1;
        relationOwnership[1] += 1;
      }
    }

    if (!hasAnyReportData) {
      return null;
    }

    return new OwnershipByteCell(ownedByPlayer, neutralOwned, botOwned, humanOwned, relationOwnership);
  }

  private static addDiplomaticRelationCount(
    relationOwnership: RelationOwnershipTuple,
    status: DiplomaticStatus
  ): void {
    switch (status) {
      case DiplomaticStatus.SELF:
        relationOwnership[0] += 1;
        break;
      case DiplomaticStatus.WAR:
        relationOwnership[2] += 1;
        break;
      case DiplomaticStatus.ALLIED:
        relationOwnership[5] += 1;
        break;
      case DiplomaticStatus.PEACE:
        relationOwnership[4] += 1;
        break;
      case DiplomaticStatus.PASSIVE:
      case DiplomaticStatus.NEUTRAL:
      default:
        relationOwnership[3] += 1;
        break;
    }
  }
}
