import { Planet } from './planets/planet';
import { TechnologyType } from './enums/technology-type';
import { Fleet } from './fleets/fleet';
import { PlayerType } from './enums/player-type';
import { PlayerReport } from './reports/player-report';
import { PlayerMessage } from './mail/player-message';
import { SupportRequestType } from './requests/support-request';
import {
  TutorialReadState,
  TutorialViewKey,
  createTutorialReadState,
  normalizeTutorialReadState
} from '../tutorial/tutorial-types';

export type BotProfileId =
  | 'BALANCED'
  | 'AGGRESSOR'
  | 'TURTLE'
  | 'MINER'
  | 'AVOIDER'
  | 'BUNKERER';

export const BOT_PROFILE_IDS: BotProfileId[] = [
  'BALANCED',
  'AGGRESSOR',
  'TURTLE',
  'MINER',
  'AVOIDER',
  'BUNKERER'
];

export const BOT_PROFILE_LABELS: Record<BotProfileId, string> = {
  BALANCED: 'Balanced',
  AGGRESSOR: 'Aggressor',
  TURTLE: 'Turtle',
  MINER: 'Miner',
  AVOIDER: 'Avoider',
  BUNKERER: 'Bunkerer'
};

export type BotGoalType =
  | 'KEY_BUILDING_UP'
  | 'ECONOMY_TECH_UP'
  | 'COLONIZE_NEARBY'
  | 'REFRESH_INTEL'
  | 'PREPARE_SAFE_ATTACK'
  | 'FORTIFY_BORDER';

export type BotMemoryCoordinates = {
  x: number;
  y: number;
  z: number;
};

export type BotMemoryResources = {
  metal: number;
  crystal: number;
  deuterium: number;
};

export type BotMemoryDiplomacyTarget = {
  playerId: number;
  requestedStatus: 'PEACE' | 'ALLIED';
  turn: number;
};

export type BotMemoryGoodwillEntry = {
  playerId: number;
  score: number;
  updatedTurn: number;
};

export type BotMemorySupportRequestRecord = {
  playerId: number;
  supportType: SupportRequestType;
  targetCoordinates: BotMemoryCoordinates;
  turn: number;
};

export type BotFarmLossBracket =
  | 'NONE'
  | 'LIGHT'
  | 'MEDIUM'
  | 'HEAVY'
  | 'DEFEAT';

export type BotFarmTargetRecord = {
  targetCoordinates: BotMemoryCoordinates;
  lastAttackTurn: number | null;
  nextAllowedAttackTurn: number | null;
  lastSentCombatStrength: number | null;
  lastKnownDefenceCount: number | null;
  lastKnownShipCount: number | null;
  lastKnownOpened: boolean;
  nextForceMultiplier: number;
  lastLossBracket: BotFarmLossBracket | null;
};

export type BotMemory = {
  currentGoal: BotGoalType | null;
  goalTarget: BotMemoryCoordinates | null;
  goalExpiresTurn: number | null;
  reservedResources: BotMemoryResources;
  lastSpyTargets: BotMemoryCoordinates[];
  lastAttackTargets: BotMemoryCoordinates[];
  recentDiplomacyTargets: BotMemoryDiplomacyTarget[];
  goodwillByPlayer?: BotMemoryGoodwillEntry[];
  recentSupportRequests?: BotMemorySupportRequestRecord[];
  processedSupportOutcomeIds?: number[];
  farmTargets?: BotFarmTargetRecord[];
  lastProcessedFleetReportId?: number | null;
};

export type BotV2SubsystemId =
  | 'ECONOMIC'
  | 'DEFENSIVE'
  | 'WARFARE'
  | 'CRITICAL'
  | 'STRATEGIC_DEVELOPMENT'
  | 'STRATEGIC_MILITARY'
  | 'STRATEGIC_DIPLOMATIC';

export type BotMemoryV2RecentTarget = {
  key: string;
  turn: number;
};

export type BotMemoryV2LongTermCommitment = {
  commitmentKey: string;
  subsystemId: BotV2SubsystemId;
  createdTurn: number;
  expiresOnTurn: number | null;
};

export type BotMemoryV2 = {
  version: 1;
  currentStance: string | null;
  antiOscillation: {
    lastMajorFocus: string | null;
    lastMajorFocusTurn: number | null;
    doNotReplaceBeforeTurn: number | null;
  };
  cooldowns: Record<string, number>;
  recentTargets: BotMemoryV2RecentTarget[];
  acceptedLongTermCommitments: BotMemoryV2LongTermCommitment[];
};

export type PlayerExtras = {
  botProfileId?: BotProfileId | null;
  botMemory?: BotMemory | null;
  botMemoryV2?: BotMemoryV2 | null;
};

export function defaultBotProfileIdForPlayerId(playerId: number): BotProfileId {
  const normalizedPlayerId = Number.isInteger(playerId) ? Math.abs(playerId) : 0;
  return BOT_PROFILE_IDS[normalizedPlayerId % BOT_PROFILE_IDS.length] ?? 'BALANCED';
}

export class Player {
  public botProfileId: BotProfileId | null;
  public botMemory: BotMemory | null;
  public botMemoryV2: BotMemoryV2 | null;

  constructor(
    public playerId: number,
    public playerName: string,
    public planets: Planet[],
    public tech: Map<TechnologyType, number>,
    public fleets: Fleet[],
    public type: PlayerType,
    public tutorialRead: TutorialReadState = createTutorialReadState(false),
    public reports: PlayerReport[] = [],
    public nextReportId = 1,
    public messages: PlayerMessage[] = [],
    public nextMessageId = 1,
    extras: PlayerExtras = {}
  ) {
    this.botProfileId = extras.botProfileId ?? null;
    this.botMemory = Player.normalizeBotMemory(extras.botMemory);
    this.botMemoryV2 = Player.normalizeBotMemoryV2(extras.botMemoryV2);
  }

  public getTechLevel(type: TechnologyType): number {
    return this.tech.get(type) ?? 0;
  }

  public setTechLevel(type: TechnologyType, level: number): void {
    const normalized = Math.max(0, Math.floor(level));
    if (normalized === 0) {
      this.tech.delete(type);
      return;
    }

    this.tech.set(type, normalized);
  }

  public addTechLevel(type: TechnologyType, delta = 1): number {
    const next = this.getTechLevel(type) + delta;
    this.setTechLevel(type, next);
    return this.getTechLevel(type);
  }

  public createReportId(): number {
    const reportId = this.nextReportId;
    this.nextReportId += 1;
    return reportId;
  }

  public createMessageId(): number {
    const messageId = this.nextMessageId;
    this.nextMessageId += 1;
    return messageId;
  }

  public addReport(report: PlayerReport): void {
    this.reports.push(report);
    if (report.reportId >= this.nextReportId) {
      this.nextReportId = report.reportId + 1;
    }
  }

  public addMessage(message: PlayerMessage): void {
    this.messages.push(message);
    if (message.messageId >= this.nextMessageId) {
      this.nextMessageId = message.messageId + 1;
    }
  }

  public markReportAsRead(reportId: number): boolean {
    const report = this.reports.find((entry) => entry.reportId === reportId);
    if (!report) {
      return false;
    }

    report.markAsRead();
    return true;
  }

  public deleteReports(reportIds: number[]): number {
    const selected = new Set(reportIds);
    if (selected.size === 0) {
      return 0;
    }

    const before = this.reports.length;
    this.reports = this.reports.filter((report) => !selected.has(report.reportId));
    return before - this.reports.length;
  }

  public markMessageAsRead(messageId: number): boolean {
    const message = this.messages.find((entry) => entry.messageId === messageId);
    if (!message) {
      return false;
    }

    message.markAsRead();
    return true;
  }

  public deleteMessages(messageIds: number[]): number {
    const selected = new Set(messageIds);
    if (selected.size === 0) {
      return 0;
    }

    const before = this.messages.length;
    this.messages = this.messages.filter((message) => !selected.has(message.messageId));
    return before - this.messages.length;
  }

  public isTutorialRead(viewKey: TutorialViewKey): boolean {
    return this.tutorialRead[viewKey];
  }

  public markTutorialRead(viewKey: TutorialViewKey): void {
    this.tutorialRead[viewKey] = true;
  }

  public markAllTutorialsRead(): void {
    this.tutorialRead = createTutorialReadState(true);
  }

  public static techLevelsFromRecord(
    record: Record<string, number> | null | undefined
  ): Map<TechnologyType, number> {
    const map = new Map<TechnologyType, number>();
    if (!record) {
      return map;
    }

    for (const [key, value] of Object.entries(record)) {
      if (!Number.isFinite(value)) {
        continue;
      }

      const normalized = Math.max(0, Math.floor(value));
      if (normalized === 0) {
        continue;
      }

      map.set(key as TechnologyType, normalized);
    }

    return map;
  }

  public static techLevelsToRecord(
    map: Map<TechnologyType, number>
  ): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [type, level] of map.entries()) {
      if (!Number.isFinite(level)) {
        continue;
      }

      const normalized = Math.max(0, Math.floor(level));
      if (normalized === 0) {
        continue;
      }

      record[type] = normalized;
    }

    return record;
  }

  public static tutorialReadStateFromRecord(
    record: Partial<Record<string, unknown>> | null | undefined,
    fallback = false
  ): TutorialReadState {
    return normalizeTutorialReadState(record, fallback);
  }

  public static normalizeBotMemory(memory: BotMemory | null | undefined): BotMemory | null {
    if (!memory) {
      return null;
    }

    return {
      currentGoal: memory.currentGoal ?? null,
      goalTarget: Player.normalizeBotMemoryCoordinates(memory.goalTarget),
      goalExpiresTurn: Number.isInteger(memory.goalExpiresTurn) ? memory.goalExpiresTurn : null,
      reservedResources: Player.normalizeBotMemoryResources(memory.reservedResources),
      lastSpyTargets: Player.normalizeBotMemoryCoordinatesList(memory.lastSpyTargets),
      lastAttackTargets: Player.normalizeBotMemoryCoordinatesList(memory.lastAttackTargets),
      recentDiplomacyTargets: Player.normalizeBotMemoryDiplomacyTargets(memory.recentDiplomacyTargets),
      goodwillByPlayer: Player.normalizeBotMemoryGoodwillEntries(memory.goodwillByPlayer),
      recentSupportRequests: Player.normalizeBotMemorySupportRequestRecords(memory.recentSupportRequests),
      processedSupportOutcomeIds: Player.normalizeBotMemorySupportOutcomeIds(memory.processedSupportOutcomeIds),
      farmTargets: Player.normalizeBotFarmTargetRecords(memory.farmTargets),
      lastProcessedFleetReportId: Number.isInteger(memory.lastProcessedFleetReportId)
        ? memory.lastProcessedFleetReportId
        : null
    };
  }

  public static normalizeBotMemoryV2(memory: BotMemoryV2 | null | undefined): BotMemoryV2 | null {
    if (!memory) {
      return null;
    }

    return {
      version: 1,
      currentStance: Player.normalizeBotMemoryV2String(memory.currentStance, 80),
      antiOscillation: {
        lastMajorFocus: Player.normalizeBotMemoryV2String(memory.antiOscillation?.lastMajorFocus, 80),
        lastMajorFocusTurn: Number.isInteger(memory.antiOscillation?.lastMajorFocusTurn)
          ? memory.antiOscillation.lastMajorFocusTurn
          : null,
        doNotReplaceBeforeTurn: Number.isInteger(memory.antiOscillation?.doNotReplaceBeforeTurn)
          ? memory.antiOscillation.doNotReplaceBeforeTurn
          : null
      },
      cooldowns: Player.normalizeBotMemoryV2Cooldowns(memory.cooldowns),
      recentTargets: Player.normalizeBotMemoryV2RecentTargets(memory.recentTargets),
      acceptedLongTermCommitments: Player.normalizeBotMemoryV2LongTermCommitments(
        memory.acceptedLongTermCommitments
      )
    };
  }

  private static normalizeBotMemoryCoordinates(
    coordinates: BotMemoryCoordinates | null | undefined
  ): BotMemoryCoordinates | null {
    if (
      !coordinates
      || !Number.isInteger(coordinates.x)
      || !Number.isInteger(coordinates.y)
      || !Number.isInteger(coordinates.z)
    ) {
      return null;
    }

    return {
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z
    };
  }

  private static normalizeBotMemoryCoordinatesList(
    coordinates: BotMemoryCoordinates[] | null | undefined
  ): BotMemoryCoordinates[] {
    if (!Array.isArray(coordinates)) {
      return [];
    }

    return coordinates
      .map((entry) => Player.normalizeBotMemoryCoordinates(entry))
      .filter((entry): entry is BotMemoryCoordinates => entry !== null)
      .slice(0, 20);
  }

  private static normalizeBotMemoryResources(
    resources: BotMemoryResources | null | undefined
  ): BotMemoryResources {
    if (!resources) {
      return {
        metal: 0,
        crystal: 0,
        deuterium: 0
      };
    }

    return {
      metal: Number.isFinite(resources.metal) ? Math.max(0, Math.floor(resources.metal)) : 0,
      crystal: Number.isFinite(resources.crystal) ? Math.max(0, Math.floor(resources.crystal)) : 0,
      deuterium: Number.isFinite(resources.deuterium) ? Math.max(0, Math.floor(resources.deuterium)) : 0
    };
  }

  private static normalizeBotMemoryDiplomacyTargets(
    entries: BotMemoryDiplomacyTarget[] | null | undefined
  ): BotMemoryDiplomacyTarget[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) =>
        !!entry
        && Number.isInteger(entry.playerId)
        && (entry.requestedStatus === 'PEACE' || entry.requestedStatus === 'ALLIED')
        && Number.isInteger(entry.turn)
      )
      .map((entry) => ({
        playerId: entry.playerId,
        requestedStatus: entry.requestedStatus,
        turn: entry.turn
      }))
      .slice(-20);
  }

  private static normalizeBotMemoryGoodwillEntries(
    entries: BotMemoryGoodwillEntry[] | null | undefined
  ): BotMemoryGoodwillEntry[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) =>
        !!entry
        && Number.isInteger(entry.playerId)
        && Number.isFinite(entry.score)
        && Number.isInteger(entry.updatedTurn)
      )
      .map((entry) => ({
        playerId: entry.playerId,
        score: Math.max(-100, Math.min(100, Math.round(entry.score))),
        updatedTurn: entry.updatedTurn
      }))
      .slice(-40);
  }

  private static normalizeBotMemorySupportRequestRecords(
    entries: BotMemorySupportRequestRecord[] | null | undefined
  ): BotMemorySupportRequestRecord[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((entry) => {
        const targetCoordinates = Player.normalizeBotMemoryCoordinates(entry?.targetCoordinates);
        if (
          !entry
          || !Number.isInteger(entry.playerId)
          || !targetCoordinates
          || !Number.isInteger(entry.turn)
        ) {
          return null;
        }

        return {
          playerId: entry.playerId,
          supportType: entry.supportType,
          targetCoordinates,
          turn: entry.turn
        };
      })
      .filter((entry): entry is BotMemorySupportRequestRecord => entry !== null)
      .slice(-40);
  }

  private static normalizeBotMemorySupportOutcomeIds(
    entries: number[] | null | undefined
  ): number[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) => Number.isInteger(entry) && entry > 0)
      .map((entry) => Math.floor(entry))
      .slice(-80);
  }

  private static normalizeBotFarmTargetRecords(
    entries: BotFarmTargetRecord[] | null | undefined
  ): BotFarmTargetRecord[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .map((entry) => {
        const targetCoordinates = Player.normalizeBotMemoryCoordinates(entry?.targetCoordinates);
        if (!targetCoordinates) {
          return null;
        }

        return {
          targetCoordinates,
          lastAttackTurn: Number.isInteger(entry?.lastAttackTurn) ? entry.lastAttackTurn : null,
          nextAllowedAttackTurn: Number.isInteger(entry?.nextAllowedAttackTurn) ? entry.nextAllowedAttackTurn : null,
          lastSentCombatStrength: Number.isFinite(entry?.lastSentCombatStrength)
            ? Math.max(0, Number(entry.lastSentCombatStrength))
            : null,
          lastKnownDefenceCount: Number.isInteger(entry?.lastKnownDefenceCount)
            ? Math.max(0, Number(entry?.lastKnownDefenceCount ?? 0))
            : null,
          lastKnownShipCount: Number.isInteger(entry?.lastKnownShipCount)
            ? Math.max(0, Number(entry?.lastKnownShipCount ?? 0))
            : null,
          lastKnownOpened: entry?.lastKnownOpened === true,
          nextForceMultiplier: Number.isFinite(entry?.nextForceMultiplier)
            ? Math.max(1, Number(entry.nextForceMultiplier))
            : 1,
          lastLossBracket: Player.normalizeBotFarmLossBracket(entry?.lastLossBracket)
        };
      })
      .filter((entry): entry is BotFarmTargetRecord => entry !== null)
      .slice(-40);
  }

  private static normalizeBotFarmLossBracket(
    bracket: BotFarmLossBracket | null | undefined
  ): BotFarmLossBracket | null {
    switch (bracket) {
      case 'NONE':
      case 'LIGHT':
      case 'MEDIUM':
      case 'HEAVY':
      case 'DEFEAT':
        return bracket;
      default:
        return null;
    }
  }

  private static normalizeBotMemoryV2String(
    value: string | null | undefined,
    maxLength: number
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    return trimmed.slice(0, maxLength);
  }

  private static normalizeBotMemoryV2Cooldowns(
    cooldowns: Record<string, number> | null | undefined
  ): Record<string, number> {
    const normalized: Record<string, number> = {};
    if (!cooldowns || typeof cooldowns !== 'object') {
      return normalized;
    }

    for (const [key, value] of Object.entries(cooldowns)) {
      const trimmedKey = key.trim();
      if (trimmedKey.length === 0 || !Number.isInteger(value)) {
        continue;
      }

      normalized[trimmedKey.slice(0, 80)] = Math.max(0, value);
    }

    return normalized;
  }

  private static normalizeBotMemoryV2RecentTargets(
    recentTargets: BotMemoryV2RecentTarget[] | null | undefined
  ): BotMemoryV2RecentTarget[] {
    if (!Array.isArray(recentTargets)) {
      return [];
    }

    return recentTargets
      .map((entry) => {
        const key = Player.normalizeBotMemoryV2String(entry?.key, 120);
        if (!key || !Number.isInteger(entry?.turn)) {
          return null;
        }

        return {
          key,
          turn: entry.turn
        };
      })
      .filter((entry): entry is BotMemoryV2RecentTarget => entry !== null)
      .slice(-40);
  }

  private static normalizeBotMemoryV2LongTermCommitments(
    commitments: BotMemoryV2LongTermCommitment[] | null | undefined
  ): BotMemoryV2LongTermCommitment[] {
    if (!Array.isArray(commitments)) {
      return [];
    }

    return commitments
      .map((entry) => {
        const commitmentKey = Player.normalizeBotMemoryV2String(entry?.commitmentKey, 120);
        if (
          !commitmentKey
          || !Player.isBotV2SubsystemId(entry?.subsystemId)
          || !Number.isInteger(entry?.createdTurn)
        ) {
          return null;
        }

        return {
          commitmentKey,
          subsystemId: entry.subsystemId,
          createdTurn: entry.createdTurn,
          expiresOnTurn: Number.isInteger(entry.expiresOnTurn) ? entry.expiresOnTurn : null
        };
      })
      .filter((entry): entry is BotMemoryV2LongTermCommitment => entry !== null)
      .slice(-40);
  }

  private static isBotV2SubsystemId(value: unknown): value is BotV2SubsystemId {
    switch (value) {
      case 'ECONOMIC':
      case 'DEFENSIVE':
      case 'WARFARE':
      case 'CRITICAL':
      case 'STRATEGIC_DEVELOPMENT':
      case 'STRATEGIC_MILITARY':
      case 'STRATEGIC_DIPLOMATIC':
        return true;
      default:
        return false;
    }
  }
}
