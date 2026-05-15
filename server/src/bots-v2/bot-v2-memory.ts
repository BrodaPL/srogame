import type { BotMemoryV2, Player } from '../../../src/app/models/player.ts';
import { Player as PlayerModel } from '../../../src/app/models/player.js';

export function createDefaultBotMemoryV2(): BotMemoryV2 {
  return {
    version: 1,
    currentStance: null,
    antiOscillation: {
      lastMajorFocus: null,
      lastMajorFocusTurn: null,
      doNotReplaceBeforeTurn: null
    },
    cooldowns: {},
    recentTargets: [],
    acceptedLongTermCommitments: [],
    critical: {
      blockerLedger: []
    },
    strategicMilitary: {
      farmLedger: []
    },
    strategicDiplomatic: {
      factionLedger: [],
      primaryWarBreakTarget: null,
      openedWarTargets: [],
      sharedHostileEvents: [],
      outgoingSupportRequests: []
    },
    weightManager: {
      updatedTurn: null,
      selectedMode: 'NORMAL',
      economicRecoveryMode: false,
      warEmergencyMode: false,
      expansionMode: false,
      diplomaticCautionMode: false,
      normalSituationMode: true,
      strategicDevelopmentWeight: 0,
      strategicMilitaryWeight: 0,
      strategicDiplomaticWeight: 0,
      aggressionAxis: 0,
      industryAxis: 0,
      diplomacyAxis: 0,
      defencesAxis: 0,
      cautionAxis: 0,
      developmentAxis: 0,
      discoveredBreakNeedFarmCount: 0,
      discoveredRaidReadyFarmCount: 0,
      alliedStatusCount: 0,
      peaceStatusCount: 0,
      neutralStatusCount: 0,
      warStatusCount: 0,
      planets: []
    },
    supervisor: {
      pendingCommitments: [],
      spendingHistory: [],
      proposalHistory: [],
      fleetSlotHistory: [],
      fuelSpendingHistory: []
    }
  };
}

export function ensureBotMemoryV2(player: Player): BotMemoryV2 {
  const normalized = PlayerModel.normalizeBotMemoryV2(player.botMemoryV2);
  if (normalized) {
    player.botMemoryV2 = normalized;
    return normalized;
  }

  const created = createDefaultBotMemoryV2();
  player.botMemoryV2 = created;
  return created;
}
