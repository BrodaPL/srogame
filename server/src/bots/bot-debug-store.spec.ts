import { beforeEach, describe, expect, it } from 'vitest';
import { clearBotDecisionTraces, getBotDecisionTraces, recordBotDecisionTrace } from './bot-debug-store.js';

describe('bot-debug-store', () => {
  beforeEach(() => {
    clearBotDecisionTraces();
  });

  it('stores and filters traces by player', () => {
    recordBotDecisionTrace({
      playerId: 1,
      playerName: 'Bot-1',
      turn: 3,
      profileId: 'BALANCED',
      startingGoal: null,
      endingGoal: 'KEY_BUILDING_UP',
      actionBudget: { max: 10, used: 1, stopReason: 'below_threshold' },
      chosenActions: [],
      rejectedActions: []
    });
    recordBotDecisionTrace({
      playerId: 2,
      playerName: 'Bot-2',
      turn: 3,
      profileId: 'AGGRESSOR',
      startingGoal: null,
      endingGoal: 'PREPARE_SAFE_ATTACK',
      actionBudget: { max: 10, used: 2, stopReason: 'action_cap' },
      chosenActions: [],
      rejectedActions: []
    });

    expect(getBotDecisionTraces()).toHaveLength(2);
    expect(getBotDecisionTraces(1)).toHaveLength(1);
    expect(getBotDecisionTraces(1)[0]?.playerName).toBe('Bot-1');
  });
});
