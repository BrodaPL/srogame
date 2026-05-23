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

function readModeEnv(): BotV2FeatureFlags['mode'] {
  const value = process.env.SROGAME_BOT_AI_V2_MODE?.trim().toUpperCase() ?? '';
  if (value === 'DISABLED' || value === 'SHADOW' || value === 'LIVE') {
    return value;
  }

  const legacyEnabled = process.env.SROGAME_BOT_AI_V2_ENABLED?.trim().toLowerCase();
  if (legacyEnabled === '0' || legacyEnabled === 'false' || legacyEnabled === 'no' || legacyEnabled === 'off') {
    return 'DISABLED';
  }

  return readBooleanEnv('SROGAME_BOT_AI_V2_SHADOW_MODE', false) ? 'SHADOW' : 'LIVE';
}

export function getBotV2FeatureFlags(): BotV2FeatureFlags {
  return {
    mode: readModeEnv(),
    enabledSubsystems: {
      economic: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_ECONOMIC', true),
      defensive: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_DEFENSIVE', true),
      warfare: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_WARFARE', true),
      research: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_RESEARCH', true),
      critical: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_CRITICAL', true),
      strategicDevelopment: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_STRATEGIC_DEVELOPMENT', true),
      strategicMilitary: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_STRATEGIC_MILITARY', true),
      strategicDiplomatic: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_STRATEGIC_DIPLOMATIC', true),
      weightManager: readBooleanEnv('SROGAME_BOT_AI_V2_SUBSYSTEM_WEIGHT_MANAGER', true)
    }
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
