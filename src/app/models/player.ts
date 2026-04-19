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

export type PlayerExtras = {
  botProfileId?: BotProfileId | null;
  botMemory?: BotMemory | null;
};

export function defaultBotProfileIdForPlayerId(playerId: number): BotProfileId {
  const normalizedPlayerId = Number.isInteger(playerId) ? Math.abs(playerId) : 0;
  return BOT_PROFILE_IDS[normalizedPlayerId % BOT_PROFILE_IDS.length] ?? 'BALANCED';
}

export class Player {
  public botProfileId: BotProfileId | null;
  public botMemory: BotMemory | null;

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
}
