import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { BotV2FeatureFlags } from './bot-v2-types.ts';
import { BotBrainV2 } from './bot-brain-v2.js';
import { resolveBotV2FeatureFlags } from './bot-v2-feature-flags.js';

export function runBotTurnPhaseV2Shadow(
  galaxy: Galaxy,
  overrides?: Partial<BotV2FeatureFlags>
): void {
  const flags = resolveBotV2FeatureFlags(overrides);
  if (!flags.enabled || !flags.shadowMode) {
    return;
  }

  const brain = new BotBrainV2(flags);
  brain.runShadowTurn(galaxy);
}
