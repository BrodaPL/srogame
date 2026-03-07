import { PlayerType } from '../enums/player-type';
import type { SolarSystem } from './solar-system';

// Contains ownership data about the StarSystem based ONLY on thePlayer EspionageReportData's about this StarSystem.
export class OwnershipByteCell {
  public ownership: Int8Array;

  constructor(
    ownedByPlayer: number,
    neutralOwned: number,
    botOwned: number,
    humanOwned: number
  ) {
    this.ownership = new Int8Array(4);
    this.ownership[0] = ownedByPlayer;
    this.ownership[1] = neutralOwned;
    this.ownership[2] = botOwned;
    this.ownership[3] = humanOwned;
  }

  public static fromSolarSystem(
    system: SolarSystem,
    playerId: number,
    playerTypeById: Map<number, PlayerType>
  ): OwnershipByteCell {
    let ownedByPlayer = 0;
    let neutralOwned = 0;
    let botOwned = 0;
    let humanOwned = 0;

    for (const planet of system.planets) {
      const reportData = planet.lastReportData.get(playerId);
      if (!reportData) {
        continue;
      }

      const ownerId = planet.info.ownerId;
      if (ownerId === playerId) {
        ownedByPlayer += 1;
        continue;
      }

      if (ownerId === null) {
        neutralOwned += 1;
        continue;
      }

      const ownerType = playerTypeById.get(ownerId);
      if (ownerType === PlayerType.BOT) {
        botOwned += 1;
      } else if (ownerType === PlayerType.PLAYER) {
        humanOwned += 1;
      } else {
        neutralOwned += 1;
      }
    }

    return new OwnershipByteCell(ownedByPlayer, neutralOwned, botOwned, humanOwned);
  }
}
