import type { BotGoalType, BotProfileId } from '../../../src/app/models/player.ts';

export type BotTraceStopReason =
  | 'action_cap'
  | 'below_threshold'
  | 'no_candidates';

export type BotRejectedActionTrace = {
  kind: string;
  reason: string;
  rejectionType: 'threshold' | 'command_failed';
  expectedUtility: number | null;
  details: Record<string, string | number | boolean | null>;
};

export type BotChosenActionTrace = {
  kind: string;
  reason: string;
  expectedUtility: number;
  goalType: BotGoalType | null;
  requestSummary: string;
};

export type BotDecisionTrace = {
  playerId: number;
  playerName: string;
  turn: number;
  profileId: BotProfileId | null;
  startingGoal: BotGoalType | null;
  endingGoal: BotGoalType | null;
  actionBudget: {
    max: number;
    used: number;
    stopReason: BotTraceStopReason | null;
  };
  chosenActions: BotChosenActionTrace[];
  rejectedActions: BotRejectedActionTrace[];
};
