import type { BotV2FeatureFlags } from './bot-v2-types.ts';

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase() ?? '';
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

export function getBotV2FeatureFlags(): BotV2FeatureFlags {
  const enabled = readBooleanEnv('SROGAME_BOT_AI_V2_ENABLED', false);
  return {
    enabled,
    shadowMode: readBooleanEnv('SROGAME_BOT_AI_V2_SHADOW_MODE', enabled),
    enabledSubsystems: {
      economic: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_ECONOMIC', true),
      defensive: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_DEFENSIVE', false),
      warfare: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_WARFARE', false),
      critical: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_CRITICAL', false),
      strategicDevelopment: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_STRATEGIC_DEVELOPMENT', false),
      strategicMilitary: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_STRATEGIC_MILITARY', false),
      strategicDiplomatic: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_STRATEGIC_DIPLOMATIC', false),
      weightManager: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_WEIGHT_MANAGER', false)
    },
    allowSupervisorAcceptance: readBooleanEnv('SROGAME_BOT_AI_V2_ALLOW_SUPERVISOR_ACCEPTANCE', false),
    allowExecution: readBooleanEnv('SROGAME_BOT_AI_V2_ALLOW_EXECUTION', false)
  };
}

export function resolveBotV2FeatureFlags(
  overrides?: Partial<BotV2FeatureFlags>
): BotV2FeatureFlags {
  const base = getBotV2FeatureFlags();
  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    enabledSubsystems: {
      ...base.enabledSubsystems,
      ...(overrides.enabledSubsystems ?? {})
    }
  };
}
