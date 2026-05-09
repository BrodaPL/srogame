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
    strategicMilitary: {
      farmLedger: []
    },
    strategicDiplomatic: {
      factionLedger: [],
      primaryWarBreakTarget: null,
      openedWarTargets: []
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
