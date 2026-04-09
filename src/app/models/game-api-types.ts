import type { GameType } from './enums/game-type';
import type { PlanetType } from './enums/planet-type';
import type { BuildingType } from './enums/building-type';
import type { TechnologyType } from './enums/technology-type';
import type { ShipType } from './enums/ship-type';
import type { DefenceType } from './enums/defence-type';
import type { ManyShipsLike } from './fleets/many-ships';
import type { ManyDefencesLike } from './defences/many-defences';
import type { DefenceBuildingInstances } from './reports/defence-building-instances';
import type { ShipyardQueue } from './reports/shipyard-queue';
import type { DefencesQueue } from './reports/defences-queue';
import type { ResearchQueue } from './reports/research-queue';
import type { BuildingQueue } from './reports/building-queue';
import type { Fleet } from './fleets/fleet';
import type { NoteBorderColor } from './enums/note-border-color';
import type { PlayerType } from './enums/player-type';
import type { FleetMissionType } from './enums/fleet-mission-type';
import type { ReportType } from './enums/report-type';
import type { SmokeTestScenarioKey } from './testing/smoke-test-scenarios';
import type { TutorialReadState, TutorialViewKey } from '../tutorial/tutorial-types';
import type { DiplomaticStatus } from './diplomacy/diplomatic-status';
import type { DiplomaticProposalState } from './diplomacy/diplomatic-proposal-state';
import type { BombardmentPriorities } from './bombardment/bombardment-priority';
import type { TradeResourceType } from './trade/trade-resource-type';
import { StartingHomeworldPreset } from './enums/starting-homeworld-preset';
import { BOT_PROFILE_IDS } from './player';
import type { BotGoalType, BotProfileId } from './player';

export type BotProfileCountMap = Record<BotProfileId, number>;

export type GalaxySetup = {
  gameType: GameType;
  galaxyName: string;
  galaxyWidth: number;
  galaxyHeight: number;
  galaxyCenterSize: number;
  voidChance: number;
  starsAmountModifier: [number, number];
  playerAmount: number;
  botsAmount: number;
  botDifficulty: number;
  botProfileCounts?: BotProfileCountMap;
  neutralBotsAmount: number;
  neutralBotsDifficulty: number;
  autoSaveTurns: number;
  startingHomeworldPreset: StartingHomeworldPreset;
  createRandomPlanets?: boolean;
  createStartingShips?: boolean;
  skipTutorial?: boolean;
  smokeTestScenario?: SmokeTestScenarioKey;
  startingResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
};

export const DEFAULT_AUTO_SAVE_TURNS = 5;
export const MIN_AUTO_SAVE_TURNS = 0;
export const MAX_AUTO_SAVE_TURNS = 999;
export const DEFAULT_STARTING_HOMEWORLD_PRESET = StartingHomeworldPreset.MEDIUM;

export type GalaxySetupWithOptionalAutoSaveTurns = Omit<
  GalaxySetup,
  'autoSaveTurns' | 'botProfileCounts' | 'startingHomeworldPreset'
> & {
  autoSaveTurns?: unknown;
  botProfileCounts?: Partial<Record<BotProfileId, unknown>>;
  startingHomeworldPreset?: unknown;
};

export function normalizeAutoSaveTurns(
  value: unknown,
  fallback = DEFAULT_AUTO_SAVE_TURNS
): number {
  const normalizedFallback = Number.isInteger(fallback)
    ? Math.min(MAX_AUTO_SAVE_TURNS, Math.max(MIN_AUTO_SAVE_TURNS, fallback))
    : DEFAULT_AUTO_SAVE_TURNS;
  const parsed = typeof value === 'string'
    ? Number.parseInt(value, 10)
    : typeof value === 'number'
      ? value
      : Number.NaN;
  if (!Number.isInteger(parsed)) {
    return normalizedFallback;
  }

  return Math.min(MAX_AUTO_SAVE_TURNS, Math.max(MIN_AUTO_SAVE_TURNS, parsed));
}

export function normalizeGalaxySetup(
  setup: GalaxySetupWithOptionalAutoSaveTurns
): GalaxySetup {
  const botsAmount = Number.isInteger(setup.botsAmount) ? Math.max(0, setup.botsAmount) : 0;
  return {
    ...setup,
    botsAmount,
    botProfileCounts: normalizeBotProfileCounts(
      (setup as Partial<GalaxySetup>).botProfileCounts,
      botsAmount
    ),
    autoSaveTurns: normalizeAutoSaveTurns(setup.autoSaveTurns),
    startingHomeworldPreset: normalizeStartingHomeworldPreset(setup.startingHomeworldPreset)
  };
}

export function normalizeStartingHomeworldPreset(
  value: unknown,
  fallback = DEFAULT_STARTING_HOMEWORLD_PRESET
): StartingHomeworldPreset {
  return value === StartingHomeworldPreset.LOW
    || value === StartingHomeworldPreset.MEDIUM
    || value === StartingHomeworldPreset.HIGH
    ? value
    : fallback;
}

export function createEmptyBotProfileCounts(): BotProfileCountMap {
  return BOT_PROFILE_IDS.reduce((counts, profileId) => {
    counts[profileId] = 0;
    return counts;
  }, {} as BotProfileCountMap);
}

export function createDefaultBotProfileCounts(botsAmount: number): BotProfileCountMap {
  const normalizedBotsAmount = Number.isInteger(botsAmount) ? Math.max(0, botsAmount) : 0;
  const counts = createEmptyBotProfileCounts();
  counts.BALANCED = normalizedBotsAmount;
  return counts;
}

export function normalizeBotProfileCounts(
  counts: Partial<Record<BotProfileId, unknown>> | null | undefined,
  botsAmount: number
): BotProfileCountMap {
  const normalizedBotsAmount = Number.isInteger(botsAmount) ? Math.max(0, botsAmount) : 0;
  if (!counts) {
    return createDefaultBotProfileCounts(normalizedBotsAmount);
  }

  const normalized = createEmptyBotProfileCounts();
  for (const profileId of BOT_PROFILE_IDS) {
    const value = counts[profileId];
    const parsed = typeof value === 'string'
      ? Number.parseInt(value, 10)
      : typeof value === 'number'
        ? value
        : Number.NaN;
    normalized[profileId] = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  if (sumBotProfileCounts(normalized) === 0 && normalizedBotsAmount > 0) {
    return createDefaultBotProfileCounts(normalizedBotsAmount);
  }

  return normalized;
}

export function sumBotProfileCounts(counts: Partial<Record<BotProfileId, number>> | null | undefined): number {
  if (!counts) {
    return 0;
  }

  return BOT_PROFILE_IDS.reduce((total, profileId) => {
    const value = counts[profileId] ?? 0;
    const normalizedValue = Number.isInteger(value) && value >= 0 ? value : 0;
    return total + normalizedValue;
  }, 0);
}

export function hasExactBotProfileCountMatch(
  counts: Partial<Record<BotProfileId, number>> | null | undefined,
  botsAmount: number
): boolean {
  const normalizedBotsAmount = Number.isInteger(botsAmount) ? Math.max(0, botsAmount) : 0;
  return sumBotProfileCounts(counts) === normalizedBotsAmount;
}

export function expandBotProfileCounts(counts: Partial<Record<BotProfileId, number>> | null | undefined): BotProfileId[] {
  const expanded: BotProfileId[] = [];
  for (const profileId of BOT_PROFILE_IDS) {
    const amount = counts?.[profileId] ?? 0;
    const normalizedAmount = Number.isInteger(amount) && amount > 0 ? amount : 0;
    for (let index = 0; index < normalizedAmount; index += 1) {
      expanded.push(profileId);
    }
  }

  return expanded;
}

export type PlayerSession = {
  id: number;
  playerName: string;
  token: string;
  localAdmin: boolean;
  tutorialRead: TutorialReadState;
  unreadReportCount: number;
  unreadMailCount: number;
  pendingRequestCount: number;
};

export type RegisterRequest = {
  playerName: string;
  password: string;
};

export type LoginRequest = {
  playerName: string;
  password: string;
};

export type GalaxySystemSnapshot = {
  isVoid: boolean;
  isGalaxyCenter: boolean;
  coordinates: {
    x: number;
    y: number;
  };
};

export type GalaxySnapshot = {
  name: string;
  currentTurn: number;
  diplomaticRelations: DiplomaticRelationDto[];
  stars: GalaxySystemSnapshot[][];
};

export type DiplomaticRelationDto = {
  playerAId: number;
  playerBId: number;
  status: DiplomaticStatus;
};

export type StartGameRequest = {
  setup: GalaxySetup;
};

export type StartGameResponse = {
  player: PlayerSession;
  galaxy: GalaxySnapshot;
};

export type GameStateResponse = {
  player: PlayerSession;
  galaxy: GalaxySnapshot;
};

export type BotTraceStopReason =
  | 'action_cap'
  | 'below_threshold'
  | 'no_candidates';

export type BotRejectedActionTraceDto = {
  kind: string;
  reason: string;
  rejectionType: 'threshold' | 'command_failed';
  expectedUtility: number | null;
  details: Record<string, string | number | boolean | null>;
};

export type BotChosenActionTraceDto = {
  kind: string;
  reason: string;
  expectedUtility: number;
  goalType: BotGoalType | null;
  requestSummary: string;
};

export type BotDecisionTraceDto = {
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
  chosenActions: BotChosenActionTraceDto[];
  rejectedActions: BotRejectedActionTraceDto[];
};

export type BotDecisionTracesResponse = {
  turn: number;
  traces: BotDecisionTraceDto[];
};

export type BotAdminStateDto = {
  playerId: number;
  playerName: string;
  profileId: BotProfileId | null;
  currentGoal: BotGoalType | null;
  planetsOwned: number;
  activeFleetCount: number;
  paused: boolean;
};

export type BotAdminStatesResponse = {
  turn: number;
  bots: BotAdminStateDto[];
};

export type UpdateBotProfileRequest = {
  profileId: BotProfileId;
};

export type BotAdminActionResponse = {
  turn: number;
  bot: BotAdminStateDto;
};

export type EndTurnResponse = {
  player: PlayerSession;
  galaxy: GalaxySnapshot;
  resolution: 'WAITING' | 'RESOLVED';
  turnStatus: TurnStatusResponse;
};

export type TurnStatusResponse = {
  currentTurn: number;
  requiresAllPlayersReady: boolean;
  isProcessing: boolean;
  currentPlayerReady: boolean;
  readyPlayerIds: number[];
  readyPlayerNames: string[];
  waitingForPlayerIds: number[];
  waitingForPlayerNames: string[];
};

export type LoadGameResponse = {
  player: PlayerSession;
  galaxy: GalaxySnapshot;
};

export type GameSaveSummary = {
  saveId: string;
  displayName: string;
  saveType: 'AUTOSAVE';
  autoSaveSlot: number | null;
  savedAt: string;
  ownerAccountId: number;
  ownerPlayerName: string | null;
  galaxyName: string;
  currentTurn: number;
  autoSaveTurns: number;
};

export type ActiveGameSummary = {
  ownerAccountId: number | null;
  ownerPlayerName: string | null;
  galaxyName: string;
  currentTurn: number;
};

export type GameSavesResponse = {
  saves: GameSaveSummary[];
  activeGame: ActiveGameSummary | null;
  isLoggedIn: boolean;
  currentAccountId: number | null;
  currentPlayerIsLocalAdmin: boolean;
  canManage: boolean;
  canManageReason: string | null;
};

export type MultiplayerLobbyMode = 'NEW_GAME' | 'LOAD_SAVE';

export type MultiplayerLobbyMemberDto = {
  accountId: number;
  playerName: string;
  isLocalAdmin: boolean;
  isReady: boolean;
  joinedAt: string;
};

export type MultiplayerLobbyLoadSeatDto = {
  savedPlayerId: number;
  savedPlayerName: string;
  assignedAccountId: number | null;
  assignedPlayerName: string | null;
  assignmentMode: 'ORIGINAL' | 'REPLACEMENT' | 'BOT';
};

export type MultiplayerLobbyDto = {
  hostAccountId: number;
  hostPlayerName: string;
  mode: MultiplayerLobbyMode;
  setup: GalaxySetup;
  members: MultiplayerLobbyMemberDto[];
  boundSaveId: string | null;
  boundSave: GameSaveSummary | null;
  loadSeats: MultiplayerLobbyLoadSeatDto[];
  canManage: boolean;
  isMember: boolean;
  canJoin: boolean;
  canLeave: boolean;
  canToggleReady: boolean;
  canBindSave: boolean;
  canStart: boolean;
  startBlockedReason: string | null;
};

export type MultiplayerLobbyResponse = {
  lobby: MultiplayerLobbyDto | null;
  activeGame: ActiveGameSummary | null;
  availableSaves: GameSaveSummary[];
  isLoggedIn: boolean;
  currentAccountId: number | null;
  currentPlayerName: string | null;
  currentPlayerIsLocalAdmin: boolean;
};

export type UpdateMultiplayerLobbySetupRequest = {
  setup: GalaxySetup;
};

export type ToggleMultiplayerLobbyReadyRequest = {
  ready: boolean;
};

export type AssignMultiplayerLobbySeatRequest = {
  savedPlayerId: number;
  accountId: number | null;
};

export type BindMultiplayerLobbySaveRequest = {
  saveId: string;
};

export type SetDiplomaticRelationRequest = {
  playerAId: number;
  playerBId: number;
  status: DiplomaticStatus;
};

export type CreateDiplomaticProposalRequest = {
  targetPlayerId: number;
  requestedStatus: DiplomaticStatus;
};

export type MailRecipientMode = 'player' | 'alliance';

export type SendMailMessageRequest = {
  recipientMode: MailRecipientMode;
  targetPlayerId: number | null;
  title: string;
  body: string;
};

export type SendMailMessageResponse = {
  deliveredCount: number;
};

export type AbandonPlanetRequest = {
  x: number;
  y: number;
  z: number;
};

export type ClientCoordinates = {
  x: number;
  y: number;
  z: number;
};

export type ResourcesPackDto = {
  metal: number;
  crystal: number;
  deuterium: number;
};

export type PlanetaryParametersDto = {
  metalModifier: number;
  crystalModifier: number;
  deuteriumModifier: number;
  energyModifierRES: number;
  energyModifierNuclear: number;
  scienceModifier: number;
  industryModifier: number;
  anomaliesAndNoise: number;
  hyperspaceParameters: number;
};

export type BuildingLevelEntry = {
  type: BuildingType;
  level: number;
};

export type BuildingPowerConsumptionEntry = {
  type: BuildingType;
  currentPowerConsumption: number;
};

export type BuildingStructuralPointsEntry = {
  type: BuildingType;
  currentStructuralPoints: number;
  maxStructuralPoints: number;
};

export type BuildingQueueEntryDto = {
  buildingType: BuildingType;
  nextLevel: number;
  investedIndustryPower: number;
};

export type TechLevelEntry = {
  type: TechnologyType;
  level: number;
};

export type ShipAmountEntry = {
  type: ShipType;
  amount: number;
};

export type DefenceAmountEntry = {
  type: DefenceType;
  amount: number;
};

export type CreateFleetShipSelectionEntry = {
  type: ShipType;
  undamagedAmount: number;
  damagedAmount: number;
};

export type CreateFleetBombSelectionEntry = {
  type: DefenceType;
  amount: number;
};

export type MaintenanceShipTransferEntry = {
  type: ShipType;
  amount: number;
};

export type MaintenanceBombTransferEntry = {
  type: DefenceType;
  amount: number;
};

export type TradePortOfferDto = {
  offerId: number;
  turn: number;
  getResourceType: TradeResourceType;
  getAmount: number;
  costResourceType: TradeResourceType;
  baseCost: number;
  totalCost: number;
  rolledModifierPercent: number;
  levelDiscountPercent: number;
  costModifierPercent: number;
  used: boolean;
};

export type SensorPhalanxCapabilitiesDto = {
  origin: ClientCoordinates;
  level: number;
  normalRange: number;
  activeScanRange: number;
  scanCostDeuterium: number;
  scansPerTurn: number;
  scansUsedThisTurn: number;
  remainingScans: number;
};

export type SensorPhalanxFleetContactDirection = 'INCOMING' | 'OUTGOING';

export type SensorPhalanxFleetContactDto = {
  direction: SensorPhalanxFleetContactDirection;
  fleetSize: number;
  etaTurns: number;
  isAllied: boolean;
};

export type SensorPhalanxScanRequest = {
  origin: ClientCoordinates;
  target: ClientCoordinates;
};

export type SensorPhalanxScanResponse = {
  capabilities: SensorPhalanxCapabilitiesDto;
  target: ClientCoordinates;
  targetPlanetName: string;
  contacts: SensorPhalanxFleetContactDto[];
};

export type MaintenanceTransferPayloadDto = {
  fuel: number;
  ships: MaintenanceShipTransferEntry[];
  bombs: MaintenanceBombTransferEntry[];
};

export type FleetMaintenanceShipOptionDto = {
  type: ShipType;
  available: number;
  undamagedAvailable: number;
  damagedAvailable: number;
  size: number;
};

export type FleetMaintenanceBombOptionDto = {
  type: DefenceType;
  available: number;
  undamagedAvailable: number;
  damagedAvailable: number;
  size: number;
};

export type FleetMaintenanceOptionsDto = {
  fleetId: number;
  targetPlanetName: string;
  autoApprove: boolean;
  fuelCap: number;
  supportCap: number;
  availableFuel: number;
  remainingCargoCapacity: number;
  remainingHangarCapacity: number;
  remainingBomberHangarCapacity: number;
  availableShips: FleetMaintenanceShipOptionDto[];
  availableBombs: FleetMaintenanceBombOptionDto[];
};

export type ManyShipsDto = ManyShipsLike;
export type ManyDefencesDto = ManyDefencesLike;

export type ShipyardQueueEntryDto = {
  itemKind: 'ship' | 'defence';
  shipType: ShipType | null;
  defenceType: DefenceType | null;
  amount: number;
  investedShipyardPower: number;
};

export type TechnologyQueueEntryDto = {
  technologyType: TechnologyType;
  nextLevel: number;
  investedResearchPower: number;
  helperLabs: ClientCoordinates[];
};

export type ResearchHelperForDto = {
  mainResearchCoordinates: ClientCoordinates;
  technologyType: TechnologyType;
};

export type ClientReportDataDto = {
  reportId: number;
  reportType: ReportType;
  createdTurn: number;
  title: string;
  isRead: boolean;
  sourceCoordinates: ClientCoordinates | null;
  sourcePlanetName: string | null;
  sourceSystemName: string | null;
  senderPlayerName: string | null;
  planetaryParameters: PlanetaryParametersDto;
  averageBuildingLevel: number;
  averageTotalResources: number;
  averageTechLevel: number;
  totalDefencesAmount: number;
  totalShipsAmount: number;
  buildingsLevels: BuildingLevelEntry[];
  resourcesAmount: ResourcesPackDto;
  techLevels: TechLevelEntry[];
  defences: DefenceBuildingInstances[];
  ships: ShipAmountEntry[];
  shipyardProduction: ShipyardQueue;
  defencesProduction: DefencesQueue;
  researchProduction: ResearchQueue;
  buildingProduction: BuildingQueue;
};

export type PlayerReportDtoBase = {
  reportId: number;
  reportType: ReportType;
  createdTurn: number;
  title: string;
  isRead: boolean;
  sourceCoordinates: ClientCoordinates | null;
  sourcePlanetName: string | null;
  sourceSystemName: string | null;
  senderPlayerName: string | null;
};

export type TextPlayerReportDto = PlayerReportDtoBase & {
  reportType: ReportType;
  body: string;
};

export type EspionagePlayerReportDto = PlayerReportDtoBase & {
  reportType: ReportType;
  planetaryParameters: PlanetaryParametersDto;
  averageBuildingLevel: number;
  averageTotalResources: number;
  averageTechLevel: number;
  totalDefencesAmount: number;
  totalShipsAmount: number;
  buildingsLevels: BuildingLevelEntry[];
  resourcesAmount: ResourcesPackDto;
  techLevels: TechLevelEntry[];
  defences: DefenceBuildingInstances[];
  ships: ShipAmountEntry[];
  shipyardProduction: ShipyardQueue;
  defencesProduction: DefencesQueue;
  researchProduction: ResearchQueue;
  buildingProduction: BuildingQueue;
};

export type PlayerReportDto = TextPlayerReportDto | EspionagePlayerReportDto;

export type PlayerMailMessageDto = {
  messageId: number;
  createdTurn: number;
  title: string;
  body: string;
  isRead: boolean;
  senderPlayerId: number | null;
  senderPlayerName: string | null;
};

export type ClientPlanetDto = {
  coordinates: ClientCoordinates;
  basicInfo: {
    name: string;
    type: PlanetType;
    colonizationDifficulty: number;
    order: number;
    image: string;
    size: number;
  };
  info: {
    ownerId: number | null;
    ownerPlayerType: PlayerType | null;
    ownerPlayerName: string | null;
    planetaryParameters: PlanetaryParametersDto;
  };
  objects: {
    resources: ResourcesPackDto;
    buildingsLevels: BuildingLevelEntry[];
    buildingsCurrentPowerConsumption: BuildingPowerConsumptionEntry[];
    buildingsCurrentStructuralPoints: BuildingStructuralPointsEntry[];
    defences: ManyDefencesDto;
    ships: ManyShipsDto;
    currentResearchQueue: TechnologyQueueEntryDto | null;
    researchHelperFor: ResearchHelperForDto | null;
    buildingQueue: BuildingQueueEntryDto[];
    shipyardQueue: ShipyardQueueEntryDto[];
    fleets: Fleet[];
    spaceDebris: ResourcesPackDto;
    tradePortOffers: TradePortOfferDto[];
  };
  reportData: ClientReportDataDto | null;
};

export type AbandonPlanetResponse = {
  ownedPlanets: ClientPlanetDto[];
};

export type DiplomaticProposalDto = {
  proposalId: number;
  fromPlayerId: number;
  fromPlayerName: string;
  toPlayerId: number;
  toPlayerName: string;
  requestedStatus: DiplomaticStatus;
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
  direction: 'incoming' | 'outgoing';
};

export type DiplomacyMailRequestDto = {
  requestId: number;
  requestType: 'DIPLOMACY_PROPOSAL';
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
  direction: 'incoming' | 'outgoing';
  counterpartyPlayerId: number;
  counterpartyPlayerName: string;
  requestedStatus: DiplomaticStatus;
};

export type MaintenanceMailRequestDto = {
  requestId: number;
  requestType: 'MAINTENANCE';
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
  direction: 'incoming' | 'outgoing';
  counterpartyPlayerId: number;
  counterpartyPlayerName: string;
  fleetId: number;
  targetPlanetName: string;
  requested: MaintenanceTransferPayloadDto;
  approved: MaintenanceTransferPayloadDto | null;
};

export type JumpGateMailRequestDto = {
  requestId: number;
  requestType: 'JUMP_GATE';
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
  direction: 'incoming' | 'outgoing';
  counterpartyPlayerId: number;
  counterpartyPlayerName: string;
  fleetId: number;
  missionType: FleetMissionType;
  originPlanetName: string;
  targetPlanetName: string;
  totalShips: number;
};

export type MailRequestDto = DiplomacyMailRequestDto | MaintenanceMailRequestDto | JumpGateMailRequestDto;

export type MailRecipientDto = {
  playerId: number;
  playerName: string;
  playerType: PlayerType;
  currentStatus: DiplomaticStatus;
  isAllianceMember: boolean;
};

export type MailViewResponse = {
  currentTurn: number;
  currentPlayerId: number;
  unreadMessageCount: number;
  pendingRequestCount: number;
  messages: PlayerMailMessageDto[];
  requests: MailRequestDto[];
  recipients: MailRecipientDto[];
  allianceRecipientCount: number;
};

export type DiplomacyContactDto = {
  playerId: number;
  playerName: string;
  playerType: PlayerType;
  currentStatus: DiplomaticStatus;
  isReadOnly: boolean;
  canSendMessage: boolean;
  canSendProposal: boolean;
  proposalBlockedReason: string | null;
  knownPlanets: ClientPlanetDto[];
};

export type DiplomacyViewResponse = {
  currentTurn: number;
  currentPlayerId: number;
  outgoingProposalSentThisTurn: boolean;
  contacts: DiplomacyContactDto[];
  activeProposals: DiplomaticProposalDto[];
};

export type StartBuildingConstructionRequest = {
  x: number;
  y: number;
  z: number;
  buildingType: BuildingType;
};

export type ReorderBuildingQueueRequest = {
  x: number;
  y: number;
  z: number;
  fromIndex: number;
  toIndex: number;
};

export type CancelBuildingQueueEntryRequest = {
  x: number;
  y: number;
  z: number;
  index: number;
};

export type StartShipyardConstructionRequest = {
  x: number;
  y: number;
  z: number;
  itemKind: 'ship' | 'defence';
  shipType?: ShipType | null;
  defenceType?: DefenceType | null;
  amount: number;
};

export type ReorderShipyardQueueRequest = {
  x: number;
  y: number;
  z: number;
  fromIndex: number;
  toIndex: number;
};

export type CancelShipyardQueueEntryRequest = {
  x: number;
  y: number;
  z: number;
  index: number;
};

export type StartTechnologyResearchRequest = {
  x: number;
  y: number;
  z: number;
  technologyType: TechnologyType;
  helperPlanets: ClientCoordinates[];
};

export type CreateFleetMissionRequest = {
  missionType: FleetMissionType;
  origin: ClientCoordinates;
  target: ClientCoordinates;
  ships: CreateFleetShipSelectionEntry[];
  carriedBombs: CreateFleetBombSelectionEntry[];
  cargo: ResourcesPackDto;
  useJumpGate?: boolean;
  bombardmentPriorities?: BombardmentPriorities | null;
};

export type CreateFleetMissionResponse = {
  ownedPlanets: ClientPlanetDto[];
  activeFleets: Fleet[];
  mode?: 'LAUNCHED' | 'PENDING_JUMP_GATE';
  message?: string | null;
};

export type CreateMaintenanceRequestRequest = MaintenanceTransferPayloadDto;

export type CreateMaintenanceRequestResponse = {
  activeFleets: Fleet[];
  mode: 'AUTO_APPROVED' | 'PENDING';
  message: string;
};

export type ResolveMaintenanceRequestRequest = MaintenanceTransferPayloadDto;

export type MarkPlayerReportReadRequest = {
  reportId: number;
};

export type DeletePlayerReportsRequest = {
  reportIds: number[];
};

export type DeletePlayerReportsResponse = {
  deletedCount: number;
};

export type MarkMailMessageReadRequest = {
  messageId: number;
};

export type DeleteMailMessagesRequest = {
  messageIds: number[];
};

export type DeleteMailMessagesResponse = {
  deletedCount: number;
};

export type DeleteMailRequestRefDto = {
  requestId: number;
  requestType: MailRequestDto['requestType'];
};

export type DeleteMailRequestsRequest = {
  requests: DeleteMailRequestRefDto[];
};

export type DeleteMailRequestsResponse = {
  deletedCount: number;
};

export type MarkTutorialReadRequest = {
  viewKey?: TutorialViewKey;
  markAllRead?: boolean;
};

export type SetBuildingPowerConsumptionRequest = {
  x: number;
  y: number;
  z: number;
  buildingType: BuildingType;
  currentPowerConsumption: number;
};

export type SetBuildingPowerConsumptionResponse = {
  buildingType: BuildingType;
  currentPowerConsumption: number;
};

export type UseTradePortOfferRequest = {
  x: number;
  y: number;
  z: number;
  offerId: number;
};

export type ClientInfoDto = {
  ownedPlanetCount: number;
  neutralPlanetCount: number;
  botPlanetCount: number;
  humanPlanetCount: number;
};

export type ClientStarSystemDto = {
  coordinates: ClientCoordinates;
  name: string;
  isGalaxyCenter: boolean;
  isVoid: boolean;
  isCenterEdge: boolean;
  discoveredByPlayer: number[];
  planets: ClientPlanetDto[];
  clientInfo: ClientInfoDto;
};

export type PlayerNameEntry = {
  playerId: number;
  playerName: string;
};

export type ClientGalaxyDto = {
  name: string;
  stars: ClientStarSystemDto[][];
  playerNames: PlayerNameEntry[];
};

export type GalaxyByteCellDto = {
  planetsAndAsteroids: [number, number];
};

export type OwnershipByteCellDto = {
  ownership: [number, number, number, number];
};

export type StarSystemNoteDto = {
  coordinates: {
    x: number;
    y: number;
  };
  borderColor: NoteBorderColor;
  text: string;
};

export type UpsertStarSystemNoteRequest = {
  x: number;
  y: number;
  borderColor: NoteBorderColor;
  text: string;
};

export type GalaxyPresentationDataDto = {
  galaxyBytes: GalaxyByteCellDto[][];
  ownershipBytes: Array<Array<OwnershipByteCellDto | null>>;
  ownedPlanets: ClientPlanetDto[];
  ownFleetMovements: GalaxyOwnFleetMovementDto[];
  starSystemNotes: StarSystemNoteDto[];
};

export type GalaxyFleetRouteKind = 'OUTBOUND' | 'RETURNING';

export type GalaxyOwnFleetMovementDto = {
  fleetId: number;
  missionType: FleetMissionType;
  state: Fleet['state'];
  routeKind: GalaxyFleetRouteKind;
  originSystemCoordinates: {
    x: number;
    y: number;
  };
  targetSystemCoordinates: {
    x: number;
    y: number;
  };
  currentSystemCoordinates: {
    x: number;
    y: number;
  } | null;
  shipCount: number;
  etaTurns: number | null;
  originPlanetName: string;
  targetPlanetName: string;
};
