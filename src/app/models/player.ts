import { Planet } from './planets/planet';
import { TechnologyType } from './enums/technology-type';
import { Fleet } from './fleets/fleet';
import { PlayerType } from './enums/player-type';
import { PlayerReport } from './reports/player-report';
import { PlayerMessage } from './mail/player-message';
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

export type BotMemory = {
  currentGoal: BotGoalType | null;
  goalTarget: BotMemoryCoordinates | null;
  goalExpiresTurn: number | null;
  reservedResources: BotMemoryResources;
  lastSpyTargets: BotMemoryCoordinates[];
  lastAttackTargets: BotMemoryCoordinates[];
  recentDiplomacyTargets: BotMemoryDiplomacyTarget[];
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
      recentDiplomacyTargets: Player.normalizeBotMemoryDiplomacyTargets(memory.recentDiplomacyTargets)
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
}
