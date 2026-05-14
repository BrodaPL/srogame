import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import gameApiTypesModule from '../../src/app/models/game-api-types.js';
import galaxyCreatorModule from '../../src/app/models/planets/galaxy-creator.js';
import planetAbandonmentModule from '../../src/app/models/planets/planet-abandonment.js';
import galaxyPresentationDataModule from '../../src/app/models/planets/galaxy-presentation-data.js';
import espionageReportGeneratorModule from '../../src/app/generators/espionage-report-generator.js';
import starSystemNoteModule from '../../src/app/models/planets/star-system-note.js';
import noteBorderColorModule from '../../src/app/models/enums/note-border-color.js';
import buildingTypeEnumModule from '../../src/app/models/enums/building-type.js';
import defenceTypeEnumModule from '../../src/app/models/enums/defence-type.js';
import technologyTypeEnumModule from '../../src/app/models/enums/technology-type.js';
import shipTypeEnumModule from '../../src/app/models/enums/ship-type.js';
import shipPurposeEnumModule from '../../src/app/models/enums/ship-purpose.js';
import fleetMissionTypeEnumModule from '../../src/app/models/enums/fleet-mission-type.js';
import hullClassEnumModule from '../../src/app/models/enums/hull-class.js';
import fleetModelModule from '../../src/app/models/fleets/fleet.js';
import manyShipsModule from '../../src/app/models/fleets/many-ships.js';
import manyDefencesModule from '../../src/app/models/defences/many-defences.js';
import reportTypeEnumModule from '../../src/app/models/enums/report-type.js';
import diplomaticStatusEnumModule from '../../src/app/models/diplomacy/diplomatic-status.js';
import diplomacyResolverModule from '../../src/app/models/diplomacy/diplomacy-resolver.js';
import diplomaticProposalStateModule from '../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import diplomaticProposalModule from '../../src/app/models/diplomacy/diplomatic-proposal.js';
import diplomacyProposalRulesModule from '../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import planetaryBombModule from '../../src/app/models/defences/planetary-bomb.js';
import bombardmentPriorityModule from '../../src/app/models/bombardment/bombardment-priority.js';
import jumpGateCapacityModule from '../../src/app/models/jump-gates/jump-gate-capacity.js';
import jumpGateRequestModule from '../../src/app/models/requests/jump-gate-request.js';
import maintenanceRequestModule from '../../src/app/models/requests/maintenance-request.js';
import supportRequestModule from '../../src/app/models/requests/support-request.js';
import tradePortOffersModule from '../../src/app/models/trade/trade-port-offers.js';
import tutorialTypesModule from '../../src/app/tutorial/tutorial-types.js';
import buildingBlueprintsFactoryModule from '../../src/app/factories/building-blueprints.factory.js';
import defenceBlueprintsFactoryModule from '../../src/app/factories/defence-blueprints.factory.js';
import shipBlueprintsFactoryModule from '../../src/app/factories/ship-blueprints.factory.js';
import technologyBlueprintsFactoryModule from '../../src/app/factories/technology-blueprints.factory.js';
import fleetMissionRegistryModule from '../../src/app/models/missions/fleet-mission-registry.js';
import buildingQueueEntryModule from '../../src/app/models/buildings/building-queue-entry.js';
import shipyardQueueEntryModule from '../../src/app/models/fleets/shipyard-queue-entry.js';
import technologyQueueEntryModule from '../../src/app/models/tech/technology-queue-entry.js';
import researchHelperForModule from '../../src/app/models/tech/research-helper-for.js';
import technologyEffectsModule from '../../src/app/models/tech/technology-effects.js';
import phaseOneTurnResolverModule from '../../src/app/models/turns/phase-one-turn-resolver.js';
import smokeTestScenariosModule from '../../src/app/models/testing/smoke-test-scenarios.js';
import queueManagementModule from '../../src/app/models/queues/queue-management.js';
import {
  AUTO_SAVE_ROTATION_LIMIT,
  MAX_GAME_SAVE_FILES,
  buildGameSaveSummary,
  deleteGameSaveById,
  hydrateGameSave,
  listGameSaveSummaries,
  listGameSaveSummariesForGame,
  readGameSaveById,
  resolveGameSaveLoadAccess,
  shouldAutoSaveAfterTurn,
  writeRotatingAutoSave
} from './game-save.js';
import {
  createGameId,
  createGameRecord,
  getGameById,
  listGames,
  upsertGameRecord,
  updateGameRecord
} from './game-registry.js';
import {
  isAccountMemberOfGame,
  listMembershipsForGame,
  listMembershipsForAccount,
  removeMembership,
  upsertMembership
} from './game-membership.js';
import {
  deleteMultiplayerLobby,
  getMultiplayerLobbyByGameId,
  listMultiplayerLobbies,
  upsertMultiplayerLobby
} from './multiplayer-lobby-store.js';
import {
  deleteGameRuntime,
  getGameRuntime,
  hasGameRuntime,
  listLoadedGameIds,
  setGameRuntime,
  updateGameRuntime
} from './game-runtime-store.js';
import {
  acknowledgeAutoSkipTurnNotice,
  activateAutoSkipTurn,
  getPresenceForGameAccount,
  listPresenceForGame,
  markPresenceSeen,
  removePresence,
  removePresenceForGame,
  setAutoSkipTurnEnabled
} from './multiplayer-presence.js';
import {
  applyLobbyLoadSeatsToGalaxy,
  assignLobbyLoadSeat,
  bindSaveToLobby,
  buildMultiplayerLobbyDto,
  clearLobbySaveBinding,
  createDefaultMultiplayerLobbySetup,
  getMultiplayerLobbyStartBlockedReason,
  joinMultiplayerLobby,
  leaveMultiplayerLobby,
  openMultiplayerLobby,
  setMultiplayerLobbyMemberReady,
  updateMultiplayerLobbySetup
} from './multiplayer-lobby.js';
import { reconcileOfflineBotControlledSeats } from './offline-bot-control.js';
import {
  activeHumanPlayers,
  areAllHumanPlayersReady,
  buildTurnStatusResponse,
  requiresAllPlayersReady
} from './active-game-turn.js';
import {
  buildResendConfirmationCooldownMessage,
  buildLockedAccountMessage,
  canResendConfirmation,
  cleanupExpiredPendingAccounts,
  clearExpiredLoginLock,
  clearLoginFailureState,
  DEFAULT_MAX_PASSWORD_RETRY_ATTEMPTS,
  DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS,
  getLoginBlockResponse,
  getResendConfirmationNextAllowedAt,
  markConfirmationResent,
  registerFailedPasswordAttempt
} from './auth-account-security.js';
import { consumeRateLimit } from './auth-rate-limit.js';
import { clearBotDecisionTracesV2, getBotDecisionTracesV2 } from './bots-v2/bot-v2-trace.js';
import {
  clearBotMemory,
  listBotAdminStates,
  pauseBot,
  resetBotAdminRuntimeState,
  resumeBot,
  setBotProfile,
  toBotAdminState
} from './bots/bot-admin.js';
import { BOT_PROFILE_IDS } from './bots/bot-profile.js';
import { buildRegisterConfigResponse, verifyTurnstileToken } from './turnstile.js';
import { startBuildingConstruction } from './game-commands/building-commands.js';
import { runBotTurnPhaseV2 } from './bots-v2/bot-v2-shadow-runner.js';
import {
  approveDiplomaticProposalCommand,
  cancelDiplomaticProposalCommand,
  createDiplomaticProposalCommand,
  currentDiplomaticStatusForPair,
  hasOutgoingProposalSentThisTurn,
  isPlayerVisibleInDiplomacy,
  rejectDiplomaticProposalCommand
} from './game-commands/diplomacy-commands.js';
import { createFleetMission } from './game-commands/fleet-commands.js';
import { createStarSystemSpyMissions } from './game-commands/star-system-spy-commands.js';
import {
  approveJumpGateRequestCommand,
  cancelJumpGateRequestCommand,
  rejectJumpGateRequestCommand
} from './game-commands/jump-gate-request-commands.js';
import {
  canFleetRequestMaintenance as canFleetRequestMaintenanceCommand,
  approveFleetMaintenanceRequest,
  cancelFleetMaintenanceRequest,
  createFleetMaintenanceRequest,
  rejectFleetMaintenanceRequest,
  resolveFleetMaintenanceOptions
} from './game-commands/maintenance-commands.js';
import {
  collectSensorPhalanxPassiveDetections,
  type SensorPhalanxPassiveDetection
} from './sensor-phalanx-passive.js';
import { startShipyardConstruction } from './game-commands/shipyard-commands.js';
import { startTechnologyResearch, updateResearchHelpers } from './game-commands/research-commands.js';
import playerMessageModule from '../../src/app/models/mail/player-message.js';
import fleetReportModule from '../../src/app/models/reports/fleet-report.js';
import sensorPhalanxReportModule from '../../src/app/models/reports/sensor-phalanx-report.js';
import resourcesPackModule from '../../src/app/models/resources-pack.js';
import type { GameCommandError } from './game-commands/command-result.ts';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type {
  BotAdminActionResponse,
  BotAdminStatesResponse,
  ApiMessageParams,
  EndTurnResponse,
  TurnStatusResponse,
  CurrentGameStatusResponse,
  AccountStatus,
  AccountSettingsResponse,
  GameListResponse,
  GameSavesResponse,
  GameSummary,
  GalaxySetup,
  GameKind,
  PlayerSession,
  GalaxySnapshot,
  LoadGameResponse,
  StartGameRequest,
  StartGameResponse,
  GameStateResponse,
  ClientGalaxyDto,
  GalaxyPresentationDataDto,
  GalaxyByteCellDto,
  OwnershipByteCellDto,
  StarSystemNoteDto,
  ClientStarSystemDto,
  ClientPlanetDto,
  ClientCoordinates,
  ClientReportDataDto,
  ResourcesPackDto,
  PlanetaryParametersDto,
  BuildingLevelEntry,
  BuildingPowerConsumptionEntry,
  BuildingStructuralPointsEntry,
  FusionReactorStageEntry,
  TechLevelEntry,
  ShipAmountEntry,
  CreateFleetShipSelectionEntry,
  ClientInfoDto,
  PlayerNameEntry,
  CreateStarSystemSpyRequest,
  CreateStarSystemSpyResponse,
  LoginRequest,
  RegisterRequest,
  RegisterConfigResponse,
  ResendConfirmationRequest,
  ResendConfirmationResponse,
  RegisterResponse,
  ResetAccountTutorialsResponse,
  UpsertStarSystemNoteRequest,
  UpdateAccountPreferencesRequest,
  UpdateBotProfileRequest,
  SetBuildingPowerConsumptionRequest,
  SetBuildingPowerConsumptionResponse,
  SetFusionReactorStageRequest,
  SetFusionReactorStageResponse,
  StartBuildingConstructionRequest,
  ReorderBuildingQueueRequest,
  CancelBuildingQueueEntryRequest,
  StartShipyardConstructionRequest,
  ReorderShipyardQueueRequest,
  CancelShipyardQueueEntryRequest,
  StartTechnologyResearchRequest,
  UpdateResearchHelpersRequest,
  CreateFleetMissionRequest,
  CreateFleetBombSelectionEntry,
  CreateFleetMissionResponse,
  PlayerReportDto,
  PlayerReportDtoBase,
  TextPlayerReportDto,
  EspionagePlayerReportDto,
  MarkPlayerReportReadRequest,
  DeletePlayerReportsRequest,
  DeletePlayerReportsResponse,
  DiplomaticRelationDto,
  SetDiplomaticRelationRequest,
  DiplomacyViewResponse,
  DiplomacyContactDto,
  DiplomaticProposalDto,
  CreateDiplomaticProposalRequest,
  CreateSupportRequestRequest,
  MailViewResponse,
  MailRequestDto,
  MailRecipientDto,
  PlayerMailMessageDto,
  MarkMailMessageReadRequest,
  DeleteMailMessagesRequest,
  DeleteMailMessagesResponse,
  DeleteMailRequestsRequest,
  DeleteMailRequestsResponse,
  CreateMaintenanceRequestRequest,
  CreateMaintenanceRequestResponse,
  FleetMaintenanceBombOptionDto,
  ResolveMaintenanceRequestRequest,
  ResolveSupportRequestRequest,
  JumpGateMailRequestDto,
  SupportMailRequestDto,
  FleetMaintenanceShipOptionDto,
  FleetMaintenanceOptionsDto,
  MaintenanceTransferPayloadDto,
  SupportRequestType as SupportRequestTypeDto,
  SendMailMessageRequest,
  SendMailMessageResponse,
  MultiplayerGameBrowserResponse,
  MultiplayerGameDetailResponse,
  LeaveCurrentMultiplayerGameResponse,
  MultiplayerRunningMemberDto,
  UpdateMultiplayerLobbySetupRequest,
  ToggleMultiplayerLobbyReadyRequest,
  UpdateMultiplayerAutoSkipTurnRequest,
  AssignMultiplayerLobbySeatRequest,
  BindMultiplayerLobbySaveRequest,
  AbandonPlanetRequest,
  AbandonPlanetResponse,
  UseTradePortOfferRequest,
  TradePortOfferDto,
  SensorPhalanxCapabilitiesDto,
  SensorPhalanxFleetContactDto,
  SensorPhalanxScanRequest,
  SensorPhalanxScanResponse
} from '../../src/app/models/game-api-types.ts';
import type { MultiplayerLobbyState } from './multiplayer-lobby.js';
import type { ClientGalaxy } from '../../src/app/models/planets/client-galaxy.ts';
import type { ClientStarSystem } from '../../src/app/models/planets/client-star-system.ts';
import type { ClientPlanet } from '../../src/app/models/planets/client-planet.ts';
import type { Planet } from '../../src/app/models/planets/planet.ts';
import type { PlanetaryParameters } from '../../src/app/models/planets/planetary-parameters.ts';
import type { ResourcesPack as ResourcesPackType } from '../../src/app/models/resources-pack.ts';
import type { EspionageReportData } from '../../src/app/models/reports/espionage-report-data.ts';
import type {
  FleetMovementSummary,
  GalaxyPresentationData as GalaxyPresentationDataType
} from '../../src/app/models/planets/galaxy-presentation-data.ts';
import type { GalaxyByteCell } from '../../src/app/models/planets/galaxy-byte-cell.ts';
import type { OwnershipByteCell } from '../../src/app/models/planets/ownership-byte-cell.ts';
import type { StarSystemNote as StarSystemNoteType } from '../../src/app/models/planets/star-system-note.ts';
import type { NoteBorderColor as NoteBorderColorType } from '../../src/app/models/enums/note-border-color.ts';
import type { BuildingType as BuildingTypeType } from '../../src/app/models/enums/building-type.ts';
import type { DefenceType as DefenceTypeType } from '../../src/app/models/enums/defence-type.ts';
import type { TechnologyType as TechnologyTypeType } from '../../src/app/models/enums/technology-type.ts';
import type { ShipType as ShipTypeType } from '../../src/app/models/enums/ship-type.ts';
import type { FleetMissionType as FleetMissionTypeType } from '../../src/app/models/enums/fleet-mission-type.ts';
import type { HullClass as HullClassType } from '../../src/app/models/enums/hull-class.ts';
import type { Building } from '../../src/app/models/buildings/building.ts';
import type { Defence } from '../../src/app/models/defences/defence.ts';
import type { Ship } from '../../src/app/models/fleets/ship.ts';
import type { Technology } from '../../src/app/models/tech/technology.ts';
import type { Player } from '../../src/app/models/player.ts';
import type { BotProfileId } from '../../src/app/models/player.ts';
import type { PlayerMessage } from '../../src/app/models/mail/player-message.ts';
import type { Fleet } from '../../src/app/models/fleets/fleet.ts';
import type {
  BombardmentPriorities as BombardmentPrioritiesType,
  BombardmentPrioritySelection as BombardmentPrioritySelectionType
} from '../../src/app/models/bombardment/bombardment-priority.ts';
import type { MaintenanceRequest } from '../../src/app/models/requests/maintenance-request.ts';
import type { JumpGateRequest } from '../../src/app/models/requests/jump-gate-request.ts';
import type { SupportRequest } from '../../src/app/models/requests/support-request.ts';
import type { MissionLaunchContext } from '../../src/app/models/missions/mission-context.ts';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../src/app/models/diplomacy/diplomatic-status.ts';
import type { DiplomaticRelation } from '../../src/app/models/diplomacy/diplomatic-relation.ts';
import type { DiplomaticProposal } from '../../src/app/models/diplomacy/diplomatic-proposal.ts';
import type { DiplomaticProposalState as DiplomaticProposalStateType } from '../../src/app/models/diplomacy/diplomatic-proposal-state.ts';
import type {
  ManyShips as ManyShipsType,
  ShipSelectionEntry as ShipSelectionEntryType
} from '../../src/app/models/fleets/many-ships.ts';
import type { PlayerReport } from '../../src/app/models/reports/player-report.ts';
import type { ReportType as ReportTypeType } from '../../src/app/models/enums/report-type.ts';
import type { PlayerType as PlayerTypeType } from '../../src/app/models/enums/player-type.ts';
import type { TradePortOffer } from '../../src/app/models/trade/trade-port-offer.ts';
import type { SensorPhalanxReport } from '../../src/app/models/reports/sensor-phalanx-report.ts';

const { GalaxyCreator } = galaxyCreatorModule as {
  GalaxyCreator: typeof import('../../src/app/models/planets/galaxy-creator.js').GalaxyCreator;
};
const {
  MAX_AUTO_SAVE_TURNS,
  hasExactBotProfileCountMatch,
  normalizeGalaxySetup
} = gameApiTypesModule as {
  MAX_AUTO_SAVE_TURNS: typeof import('../../src/app/models/game-api-types.js').MAX_AUTO_SAVE_TURNS;
  hasExactBotProfileCountMatch: typeof import('../../src/app/models/game-api-types.js').hasExactBotProfileCountMatch;
  normalizeGalaxySetup: typeof import('../../src/app/models/game-api-types.js').normalizeGalaxySetup;
};
const { abandonPlanetToNewNeutralOwner } = planetAbandonmentModule as typeof import('../../src/app/models/planets/planet-abandonment.js');
const { GalaxyPresentationData } = galaxyPresentationDataModule as {
  GalaxyPresentationData: typeof import('../../src/app/models/planets/galaxy-presentation-data.js').GalaxyPresentationData;
};
const { EspionageReportGenerator } = espionageReportGeneratorModule as {
  EspionageReportGenerator: typeof import('../../src/app/generators/espionage-report-generator.js').EspionageReportGenerator;
};
const { StarSystemNote } = starSystemNoteModule as {
  StarSystemNote: typeof import('../../src/app/models/planets/star-system-note.js').StarSystemNote;
};
const { NoteBorderColor } = noteBorderColorModule as {
  NoteBorderColor: typeof import('../../src/app/models/enums/note-border-color.js').NoteBorderColor;
};
const { BuildingType } = buildingTypeEnumModule as {
  BuildingType: typeof import('../../src/app/models/enums/building-type.js').BuildingType;
};
const { DefenceType } = defenceTypeEnumModule as {
  DefenceType: typeof import('../../src/app/models/enums/defence-type.js').DefenceType;
};
const { TechnologyType } = technologyTypeEnumModule as {
  TechnologyType: typeof import('../../src/app/models/enums/technology-type.js').TechnologyType;
};
const { ShipType } = shipTypeEnumModule as {
  ShipType: typeof import('../../src/app/models/enums/ship-type.js').ShipType;
};
const { ShipPurpose } = shipPurposeEnumModule as {
  ShipPurpose: typeof import('../../src/app/models/enums/ship-purpose.js').ShipPurpose;
};
const { FleetMissionType } = fleetMissionTypeEnumModule as {
  FleetMissionType: typeof import('../../src/app/models/enums/fleet-mission-type.js').FleetMissionType;
};
const { HullClass } = hullClassEnumModule as {
  HullClass: typeof import('../../src/app/models/enums/hull-class.js').HullClass;
};
const { FleetOrbitActivity, FleetReturnReason, FleetState } = fleetModelModule as {
  FleetOrbitActivity: typeof import('../../src/app/models/fleets/fleet.js').FleetOrbitActivity;
  FleetReturnReason: typeof import('../../src/app/models/fleets/fleet.js').FleetReturnReason;
  FleetState: typeof import('../../src/app/models/fleets/fleet.js').FleetState;
};
const { ManyShips } = manyShipsModule as {
  ManyShips: typeof import('../../src/app/models/fleets/many-ships.js').ManyShips;
};
const { ManyDefences } = manyDefencesModule as {
  ManyDefences: typeof import('../../src/app/models/defences/many-defences.js').ManyDefences;
};
const { ReportType } = reportTypeEnumModule as {
  ReportType: typeof import('../../src/app/models/enums/report-type.js').ReportType;
};
const { DiplomaticStatus } = diplomaticStatusEnumModule as {
  DiplomaticStatus: typeof import('../../src/app/models/diplomacy/diplomatic-status.js').DiplomaticStatus;
};
const { DiplomacyResolver } = diplomacyResolverModule as {
  DiplomacyResolver: typeof import('../../src/app/models/diplomacy/diplomacy-resolver.js').DiplomacyResolver;
};
const { DiplomaticProposalState } = diplomaticProposalStateModule as {
  DiplomaticProposalState: typeof import('../../src/app/models/diplomacy/diplomatic-proposal-state.js').DiplomaticProposalState;
};
const {
  isPendingDiplomaticProposalForPair
} = diplomaticProposalModule as typeof import('../../src/app/models/diplomacy/diplomatic-proposal.js');
const {
  allowedDiplomaticProposalStatuses
} = diplomacyProposalRulesModule as typeof import('../../src/app/models/diplomacy/diplomatic-proposal-rules.js');
const {
  countPlanetaryBombs,
  isPlanetaryBombDefenceType
} = planetaryBombModule as typeof import('../../src/app/models/defences/planetary-bomb.js');
const {
  normalizeBombardmentPriorities,
  isBombardmentPrioritySelection
} = bombardmentPriorityModule as typeof import('../../src/app/models/bombardment/bombardment-priority.js');
const { calculateJumpGateCapacity } = jumpGateCapacityModule as typeof import('../../src/app/models/jump-gates/jump-gate-capacity.js');
const { createJumpGateRequest } = jumpGateRequestModule as typeof import('../../src/app/models/requests/jump-gate-request.js');
const {
  createMaintenanceRequest,
  normalizeMaintenanceTransferPayload
} = maintenanceRequestModule as typeof import('../../src/app/models/requests/maintenance-request.js');
const {
  clampSupportResourcesToRequested,
  createSupportRequest,
  normalizeSupportResources,
  normalizeSupportShipAmounts,
  supportShipAmountsHaveAnyValue,
  supportResourcesHasAnyValue
} = supportRequestModule as typeof import('../../src/app/models/requests/support-request.js');
const { synchronizeTradePortOffers } = tradePortOffersModule as typeof import('../../src/app/models/trade/trade-port-offers.js');
const { TUTORIAL_VIEW_KEYS, createTutorialReadState } = tutorialTypesModule as typeof import('../../src/app/tutorial/tutorial-types.js');
const { BuildingBlueprintsFactory } = buildingBlueprintsFactoryModule as {
  BuildingBlueprintsFactory: typeof import('../../src/app/factories/building-blueprints.factory.js').BuildingBlueprintsFactory;
};
const { DefenceBlueprintsFactory } = defenceBlueprintsFactoryModule as {
  DefenceBlueprintsFactory: typeof import('../../src/app/factories/defence-blueprints.factory.js').DefenceBlueprintsFactory;
};
const { ShipBlueprintsFactory } = shipBlueprintsFactoryModule as {
  ShipBlueprintsFactory: typeof import('../../src/app/factories/ship-blueprints.factory.js').ShipBlueprintsFactory;
};
const { TechnologyBlueprintsFactory } = technologyBlueprintsFactoryModule as {
  TechnologyBlueprintsFactory: typeof import('../../src/app/factories/technology-blueprints.factory.js').TechnologyBlueprintsFactory;
};
const { FleetMissionRegistry } = fleetMissionRegistryModule as {
  FleetMissionRegistry: typeof import('../../src/app/models/missions/fleet-mission-registry.js').FleetMissionRegistry;
};
const { BuildingQueueEntry } = buildingQueueEntryModule as {
  BuildingQueueEntry: typeof import('../../src/app/models/buildings/building-queue-entry.js').BuildingQueueEntry;
};
const { ShipyardQueueEntry } = shipyardQueueEntryModule as {
  ShipyardQueueEntry: typeof import('../../src/app/models/fleets/shipyard-queue-entry.js').ShipyardQueueEntry;
};
const { TechnologyQueueEntry } = technologyQueueEntryModule as {
  TechnologyQueueEntry: typeof import('../../src/app/models/tech/technology-queue-entry.js').TechnologyQueueEntry;
};
const { ResearchHelperFor } = researchHelperForModule as {
  ResearchHelperFor: typeof import('../../src/app/models/tech/research-helper-for.js').ResearchHelperFor;
};
const { maxActiveFleets } = technologyEffectsModule as typeof import('../../src/app/models/tech/technology-effects.js');
const { resolvePhaseOneTurn } = phaseOneTurnResolverModule as typeof import('../../src/app/models/turns/phase-one-turn-resolver.js');
const { applySmokeTestScenario, isSmokeTestScenarioKey } = smokeTestScenariosModule as typeof import('../../src/app/models/testing/smoke-test-scenarios.js');
const {
  moveQueueEntry,
  calculateBuildingCancellationRefund,
  calculateShipyardCancellation
} = queueManagementModule as typeof import('../../src/app/models/queues/queue-management.js');
const { PlayerMessage: PlayerMessageModel } = playerMessageModule as {
  PlayerMessage: typeof import('../../src/app/models/mail/player-message.js').PlayerMessage;
};
const { FleetReport } = fleetReportModule as {
  FleetReport: typeof import('../../src/app/models/reports/fleet-report.js').FleetReport;
};
const { SensorPhalanxReport: SensorPhalanxReportModel } = sensorPhalanxReportModule as {
  SensorPhalanxReport: typeof import('../../src/app/models/reports/sensor-phalanx-report.js').SensorPhalanxReport;
};
const { ResourcesPack } = resourcesPackModule as {
  ResourcesPack: typeof import('../../src/app/models/resources-pack.js').ResourcesPack;
};
export const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim();

if (FRONTEND_ORIGIN) {
  app.use(cors({ origin: FRONTEND_ORIGIN }));
}
app.use(express.json());

function resolveDataPath(envName: string, relativeFallbackPath: string): string {
  const override = process.env[envName]?.trim();
  if (override) {
    return path.resolve(override);
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativeFallbackPath);
}

function resolveDurationEnv(envName: string, fallbackMs: number): number {
  const override = process.env[envName]?.trim();
  if (!override) {
    return fallbackMs;
  }

  const parsed = Number.parseInt(override, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const AUTH_DATA_PATH = resolveDataPath('SROGAME_AUTH_DATA_PATH', '../data/auth.json');
const GAME_REGISTRY_DATA_PATH = resolveDataPath('SROGAME_GAME_REGISTRY_DATA_PATH', '../data/games.json');
const GAME_MEMBERSHIPS_DATA_PATH = resolveDataPath('SROGAME_GAME_MEMBERSHIPS_DATA_PATH', '../data/game-memberships.json');
const MULTIPLAYER_LOBBY_STORE_DATA_PATH = resolveDataPath('SROGAME_MULTIPLAYER_LOBBY_STORE_DATA_PATH', '../data/multiplayer-lobbies.json');
const MULTIPLAYER_PRESENCE_DATA_PATH = resolveDataPath('SROGAME_MULTIPLAYER_PRESENCE_DATA_PATH', '../data/multiplayer-presence.json');
const GAME_SAVES_DIRECTORY_PATH = resolveDataPath('SROGAME_GAME_SAVES_DIRECTORY_PATH', '../data/saves');
const MULTIPLAYER_PRESENCE_TIMEOUT_MS = resolveDurationEnv('SROGAME_MULTIPLAYER_PRESENCE_TIMEOUT_MS', 30 * 60 * 1000);
const MULTIPLAYER_EMPTY_RUNTIME_UNLOAD_MS = resolveDurationEnv('SROGAME_MULTIPLAYER_EMPTY_RUNTIME_UNLOAD_MS', 3 * 60 * 1000);
const PLAYER_NAME_MIN = 3;
const PLAYER_NAME_MAX = 24;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;
const PENDING_CONFIRMATION_LIFETIME_MS = 30 * 60 * 1000;
const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };
const LOGIN_RATE_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };
const RESEND_CONFIRMATION_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };
const ACCOUNT_MUTATION_RATE_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };
const PLAYER_TYPE_PLAYER = 'PLAYER' as const;
const PLAYER_TYPE_NEUTRAL = 'NEUTRAL' as const;
const SELF_REPORT_LEVEL = 999;
const STARTING_SYSTEM_REPORT_LEVEL = 1;
const STAR_SYSTEM_NOTE_TEXT_MAX_LENGTH = 500;
const PLAYER_MESSAGE_TITLE_MAX_LENGTH = 50;
const PLAYER_MESSAGE_BODY_MAX_LENGTH = 1000;
const NOTE_BORDER_COLOR_VALUES = new Set<string>(Object.values(NoteBorderColor));
const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();
const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();
const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const TECHNOLOGY_BLUEPRINTS = TechnologyBlueprintsFactory.fromDefaultJson();
const FLEET_MISSION_REGISTRY = FleetMissionRegistry.createDefault();
const BUILDING_TYPE_VALUES = new Set<string>(Array.from(BUILDING_BLUEPRINTS.buildingsMap.keys()));
const DEFENCE_TYPE_VALUES = new Set<string>(Array.from(DEFENCE_BLUEPRINTS.defencesMap.keys()));
const SHIP_TYPE_VALUES = new Set<string>(Object.values(ShipType));
const FLEET_MISSION_TYPE_VALUES = new Set<string>(Object.values(FleetMissionType));
const TECHNOLOGY_TYPE_VALUES = new Set<string>(Array.from(TECHNOLOGY_BLUEPRINTS.techByType.keys()));
const DIPLOMATIC_STATUS_VALUES = new Set<string>([
  DiplomaticStatus.ALLIED,
  DiplomaticStatus.PEACE,
  DiplomaticStatus.NEUTRAL,
  DiplomaticStatus.PASSIVE,
  DiplomaticStatus.WAR
]);
const TUTORIAL_VIEW_KEY_VALUES = new Set<string>(TUTORIAL_VIEW_KEYS);
const BUILDING_TYPE_ROBOTICS_FACTORY = BuildingType.ROBOTICS_FACTORY as BuildingTypeType;
const BUILDING_TYPE_SHIPYARD = BuildingType.SHIPYARD as BuildingTypeType;
const BUILDING_TYPE_RESEARCH_LAB = BuildingType.RESEARCH_LAB as BuildingTypeType;
const TECH_TYPE_COMPUTER_TECHNOLOGY = TechnologyType.COMPUTER_TECHNOLOGY as TechnologyTypeType;
const TECH_TYPE_INTERGALACTIC_RESEARCH_NETWORK = TechnologyType.INTERGALACTIC_RESEARCH_NETWORK as TechnologyTypeType;
const PHASE_ONE_MISSION_TYPES = new Set<FleetMissionTypeType>([
  FleetMissionType.ATTACK as FleetMissionTypeType,
  FleetMissionType.MOVE as FleetMissionTypeType,
  FleetMissionType.DEFEND as FleetMissionTypeType,
  FleetMissionType.TRANSPORT as FleetMissionTypeType,
  FleetMissionType.ARMAMENT_DELIVERY as FleetMissionTypeType,
  FleetMissionType.SPY as FleetMissionTypeType,
  FleetMissionType.BOMBARD as FleetMissionTypeType,
  FleetMissionType.SIEGE as FleetMissionTypeType,
  FleetMissionType.RECYCLE as FleetMissionTypeType,
  FleetMissionType.REPAIR as FleetMissionTypeType,
  FleetMissionType.COLONIZE as FleetMissionTypeType
]);

let currentGalaxy: Galaxy | null = null;
let currentRuntimeGameId: string | null = null;
let currentGameOwnerId: number | null = null;
let currentGameOwnerPlayerName: string | null = null;
let currentGameSetup: GalaxySetup | null = null;
let currentGalaxyPresentationByPlayer = new Map<number, GalaxyPresentationDataType>();
let isTurnProcessing = false;
let currentTurnReadyPlayerIds = new Set<number>();
const ACTIVE_MULTIPLAYER_DRAFT_WINDOW_MS = 60 * 60 * 1000;

function resetActiveTurnState(): void {
  currentTurnReadyPlayerIds = new Set<number>();
  isTurnProcessing = false;
}

function clearMountedRuntimeState(): void {
  currentGalaxy = null;
  currentRuntimeGameId = null;
  currentGameOwnerId = null;
  currentGameOwnerPlayerName = null;
  currentGameSetup = null;
  currentGalaxyPresentationByPlayer = new Map<number, GalaxyPresentationDataType>();
  resetActiveTurnState();
}

function moveMountedRuntimeAwayFromGame(gameId: string): void {
  if (currentRuntimeGameId !== gameId) {
    return;
  }

  clearMountedRuntimeState();
  const fallbackRuntimeId = listLoadedGameIds().find((loadedGameId) => loadedGameId !== gameId) ?? null;
  if (fallbackRuntimeId) {
    switchCurrentRuntime(fallbackRuntimeId);
  }
}

app.get('/api/auth/register-config', (_req, res) => {
  const response: RegisterConfigResponse = buildRegisterConfigResponse();
  return res.status(200).json(response);
});

app.post('/api/auth/register', async (req, res) => {
  const registerRateLimit = consumeRateLimit('auth-register', getRequestIdentity(req), REGISTER_RATE_LIMIT);
  if (!registerRateLimit.allowed) {
    return sendApiError(
      res,
      429,
      `Too many registration attempts. Try again in ${registerRateLimit.retryAfterSeconds} seconds.`,
      'api.auth.register.rateLimited',
      { retryAfterSeconds: registerRateLimit.retryAfterSeconds }
    );
  }

  const body = req.body as RegisterRequest | undefined;
  const playerName = normalizePlayerName(body?.playerName);
  const email = normalizeEmail(body?.email);
  const password = normalizePassword(body?.password);

  if (!playerName || !email || !password) {
    return sendApiError(res, 400, 'Invalid player name, email, or password.', 'api.auth.register.invalidPayload');
  }

  const data = loadAuthData();
  if (cleanupExpiredPendingAccounts(data)) {
    saveAuthData(data);
  }

  const playerNameKey = toPlayerNameKey(playerName);
  const emailKey = toEmailKey(email);
  if (data.accounts.some((account) => account.playerNameKey === playerNameKey)) {
    return sendApiError(res, 409, 'User already exists.', 'api.auth.register.userExists');
  }
  if (data.accounts.some((account) => account.emailKey && account.emailKey === emailKey)) {
    return sendApiError(res, 409, 'Email already exists.', 'api.auth.register.emailExists');
  }

  const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken : null;
  const turnstile = await verifyTurnstileToken(turnstileToken, getRequestIdentity(req));
  if (!turnstile.ok) {
    return sendApiError(
      res,
      400,
      turnstile.error ?? 'CAPTCHA verification failed.',
      'api.auth.register.captchaFailed'
    );
  }

  const now = new Date().toISOString();
  const account = {
    id: data.nextAccountId,
    playerName,
    playerNameKey,
    email,
    emailKey,
    passwordHash: hashPassword(password),
    status: 'PENDING_CONFIRMATION' as AccountStatus,
    localAdmin: false,
    createdAt: now,
    emailConfirmedAt: null,
    confirmationExpiresAt: new Date(Date.parse(now) + PENDING_CONFIRMATION_LIFETIME_MS).toISOString(),
    lastConfirmationSentAt: now,
    lastPasswordResetRequestedAt: null,
    failedLoginAttempts: 0,
    loginLockedUntil: null,
    replaceWithBotOnLogout: false,
    logoutBotProfileId: null,
    language: null,
    currentGameId: null,
    lastClosedGameId: null,
    lastClosedAt: null
  };

  data.nextAccountId += 1;
  data.accounts.push(account);
  saveAuthData(data);

  const response: RegisterResponse = withApiMessage({
    playerName: account.playerName,
    email: account.email,
    accountStatus: account.status,
    requiresConfirmation: true,
    confirmationExpiresAt: account.confirmationExpiresAt,
    message: 'Account created. Email confirmation is required before login. For now activation must be completed manually on the server.'
  }, 'api.auth.register.successManualActivation');
  return res.status(201).json(response);
});

app.post('/api/auth/resend-confirmation', (req, res) => {
  const resendRateLimit = consumeRateLimit('auth-resend-confirmation', getRequestIdentity(req), RESEND_CONFIRMATION_RATE_LIMIT);
  if (!resendRateLimit.allowed) {
    return sendApiError(
      res,
      429,
      `Too many confirmation resend attempts. Try again in ${resendRateLimit.retryAfterSeconds} seconds.`,
      'api.auth.resendConfirmation.rateLimited',
      { retryAfterSeconds: resendRateLimit.retryAfterSeconds }
    );
  }

  const body = req.body as ResendConfirmationRequest | undefined;
  const email = normalizeEmail(body?.email);
  if (!email) {
    return sendApiError(res, 400, 'Invalid email.', 'api.auth.resendConfirmation.invalidEmail');
  }

  const data = loadAuthData();
  if (cleanupExpiredPendingAccounts(data)) {
    saveAuthData(data);
  }

  const emailKey = toEmailKey(email);
  const account = data.accounts.find((entry) => entry.emailKey === emailKey);
  const genericResponse: ResendConfirmationResponse = withApiMessage({
    message: 'If a pending account exists for that email, the confirmation window was refreshed. Email delivery is not configured yet on this server; activation must still be completed manually on the server.',
    confirmationExpiresAt: null,
    nextAllowedAt: null
  }, 'api.auth.resendConfirmation.successGeneric');

  if (!account || account.status !== 'PENDING_CONFIRMATION') {
    return res.status(200).json(genericResponse);
  }

  const nowMs = Date.now();
  if (!canResendConfirmation(account, nowMs, DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS)) {
    const nextAllowedAt = getResendConfirmationNextAllowedAt(account, DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS);
    const nextAllowedAtMs = nextAllowedAt ? Date.parse(nextAllowedAt) : Number.NaN;
    const retryAfterMs = Number.isFinite(nextAllowedAtMs)
      ? Math.max(0, nextAllowedAtMs - nowMs)
      : DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS;
    const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
    return res.status(429).json({
      ...buildApiErrorBody(
        buildResendConfirmationCooldownMessage(account, nowMs, DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS),
        'api.auth.resendConfirmation.cooldown',
        buildRetryAfterMinutesParams(retryAfterMinutes)
      ),
      nextAllowedAt
    });
  }

  const updated = markConfirmationResent(account, nowMs, PENDING_CONFIRMATION_LIFETIME_MS);
  saveAuthData(data);
  const response: ResendConfirmationResponse = withApiMessage({
    message: genericResponse.message,
    confirmationExpiresAt: updated.confirmationExpiresAt,
    nextAllowedAt: getResendConfirmationNextAllowedAt(account, DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS)
  }, 'api.auth.resendConfirmation.successGeneric');
  return res.status(200).json(response);
});

app.post('/api/auth/login', (req, res) => {
  const loginRateLimit = consumeRateLimit('auth-login', getRequestIdentity(req), LOGIN_RATE_LIMIT);
  if (!loginRateLimit.allowed) {
    return sendApiError(
      res,
      429,
      `Too many login attempts. Try again in ${loginRateLimit.retryAfterSeconds} seconds.`,
      'api.auth.login.rateLimited',
      { retryAfterSeconds: loginRateLimit.retryAfterSeconds }
    );
  }

  const body = req.body as LoginRequest | undefined;
  const playerName = normalizePlayerName(body?.playerName);
  const password = normalizePassword(body?.password);

  if (!playerName || !password) {
    return sendApiError(res, 400, 'Invalid player name or password.', 'api.auth.login.invalidCredentials');
  }

  const data = loadAuthData();
  if (cleanupExpiredPendingAccounts(data)) {
    saveAuthData(data);
  }
  const nowMs = Date.now();
  const playerNameKey = toPlayerNameKey(playerName);
  const account = data.accounts.find((entry) => entry.playerNameKey === playerNameKey);
  if (!account) {
    return sendApiError(res, 404, 'No such user.', 'api.auth.login.userNotFound');
  }
  if (clearExpiredLoginLock(account, nowMs)) {
    saveAuthData(data);
  }
  const loginBlock = getLoginBlockResponse(account, nowMs);
  if (loginBlock) {
    const retryAfterMinutes = account.loginLockedUntil
      ? Math.max(1, Math.ceil((Date.parse(account.loginLockedUntil) - nowMs) / 60000))
      : 10;
    return sendApiError(
      res,
      loginBlock.status,
      loginBlock.error,
      loginBlock.status === 403 ? 'api.auth.login.pendingConfirmation' : 'api.auth.login.accountLocked',
      loginBlock.status === 423 ? buildRetryAfterMinutesParams(retryAfterMinutes) : null
    );
  }
  if (!verifyPassword(password, account.passwordHash)) {
    const lockedUntil = registerFailedPasswordAttempt(account, nowMs);
    saveAuthData(data);
    if (lockedUntil) {
      const retryAfterMinutes = Math.max(1, Math.ceil((Date.parse(lockedUntil) - nowMs) / 60000));
      return sendApiError(
        res,
        423,
        buildLockedAccountMessage(account, nowMs),
        'api.auth.login.accountLocked',
        buildRetryAfterMinutesParams(retryAfterMinutes)
      );
    }
    const attemptsLeft = Math.max(0, DEFAULT_MAX_PASSWORD_RETRY_ATTEMPTS - account.failedLoginAttempts);
    return sendApiError(
      res,
      401,
      `Wrong password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left before a 10 minute lock.`,
      'api.auth.login.wrongPasswordAttemptsLeft',
      {
        attemptsLeft,
        attemptSuffix: pluralSuffix(attemptsLeft)
      }
    );
  }

  const now = new Date().toISOString();
  clearLoginFailureState(account);
  const session = createSession(data, account, now);
  saveAuthData(data);

  return res.status(200).json(toPlayerSession(session));
});

app.get('/api/auth/me', (req, res) => {
  const data = loadAuthData();
  if (cleanupExpiredPendingAccounts(data)) {
    saveAuthData(data);
  }
  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  reconcileLoadedRunningMultiplayerGames(data);
  return res.status(200).json(toPlayerSession(auth.session));
});

app.post('/api/auth/logout', (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const data = loadAuthData();
  cleanupExpiredPendingAccounts(data);
  const session = data.sessions.find((entry) => entry.token === token) ?? null;
  data.sessions = data.sessions.filter((entry) => entry.token !== token);
  if (session?.currentGameId && isRunningMultiplayerGame(session.currentGameId)) {
    removePresence(MULTIPLAYER_PRESENCE_DATA_PATH, session.currentGameId, session.accountId);
    reconcileRunningMultiplayerLifecycle(session.currentGameId, data);
  }
  saveAuthData(data);

  return res.status(204).send();
});

app.get('/api/account/settings', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  if (cleanupExpiredPendingAccounts(auth.data)) {
    saveAuthData(auth.data);
  }

  const account = auth.data.accounts.find((entry) => entry.id === auth.session.accountId);
  if (!account) {
    return sendApiError(res, 404, 'Account not found.', 'api.account.settings.notFound');
  }

  reconcileLoadedRunningMultiplayerGames(auth.data);

  return res.status(200).json(buildAccountSettingsResponse(account));
});

app.post('/api/account/settings/preferences', (req, res) => {
  const rateLimit = consumeRateLimit('account-settings', getRequestIdentity(req), ACCOUNT_MUTATION_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return sendApiError(
      res,
      429,
      `Too many settings updates. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      'api.account.settings.rateLimited',
      { retryAfterSeconds: rateLimit.retryAfterSeconds }
    );
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  if (cleanupExpiredPendingAccounts(auth.data)) {
    saveAuthData(auth.data);
  }

  const account = auth.data.accounts.find((entry) => entry.id === auth.session.accountId);
  if (!account) {
    return sendApiError(res, 404, 'Account not found.', 'api.account.settings.notFound');
  }

  const body = req.body as UpdateAccountPreferencesRequest | undefined;
  const replaceWithBotOnLogout = body?.replaceWithBotOnLogout === true;
  const logoutBotProfileId = normalizeBotProfileId(body?.logoutBotProfileId);
  if (replaceWithBotOnLogout && !logoutBotProfileId) {
    return sendApiError(res, 400, 'A valid bot profile is required when bot replacement is enabled.', 'api.account.settings.invalidBotProfile');
  }

  const language = normalizeLanguagePreference(body?.language);
  account.replaceWithBotOnLogout = replaceWithBotOnLogout;
  account.logoutBotProfileId = logoutBotProfileId;
  setAccountLanguagePreference(auth.data, account.id, language);
  saveAuthData(auth.data);

  return res.status(200).json(buildAccountSettingsResponse(account));
});

app.post('/api/account/settings/tutorials/reset', (req, res) => {
  const rateLimit = consumeRateLimit('account-settings', getRequestIdentity(req), ACCOUNT_MUTATION_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return sendApiError(
      res,
      429,
      `Too many settings updates. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      'api.account.settings.rateLimited',
      { retryAfterSeconds: rateLimit.retryAfterSeconds }
    );
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  if (cleanupExpiredPendingAccounts(auth.data)) {
    saveAuthData(auth.data);
  }

  const account = auth.data.accounts.find((entry) => entry.id === auth.session.accountId);
  if (!account) {
    return sendApiError(res, 404, 'Account not found.', 'api.account.settings.notFound');
  }

  let playerSession = toPlayerSession(auth.session, null);
  const access = auth.session.currentGameId
    ? resolveAuthenticatedGameAccessForGame(req, auth.session.currentGameId)
    : { status: 400, error: 'No current game selected.' as string };
  if (!('error' in access)) {
    const player = resolvePlayerById(access.galaxy, access.playerId);
    if (player) {
      player.tutorialRead = createTutorialReadState(false);
    }
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(access.galaxy);
    playerSession = toPlayerSession(access.auth.session, access.galaxy);
  } else {
    playerSession = {
      ...playerSession,
      tutorialRead: createTutorialReadState(false)
    };
  }

  const response: ResetAccountTutorialsResponse = withApiMessage({
    settings: buildAccountSettingsResponse(account),
    player: playerSession,
    message: 'Tutorial progress was reset for your current session.'
  }, 'api.account.settings.tutorialsReset');
  return res.status(200).json(response);
});

app.get('/api/games', (req, res) => {
  const auth = getAuthSession(req);
  if (auth) {
    reconcileLoadedRunningMultiplayerGames(auth.data);
  }
  return res.status(200).json(buildGameListResponse(auth?.session ?? null));
});

app.get('/api/games/current', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  reconcileLoadedRunningMultiplayerGames(auth.data);

  return res.status(200).json(buildCurrentGameStatusResponse(auth.session));
});

app.post('/api/games/:gameId/select', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  const gameId = typeof req.params.gameId === 'string' ? req.params.gameId.trim() : '';
  const record = gameId ? getGameById(GAME_REGISTRY_DATA_PATH, gameId) : null;
  if (!record || !canSessionViewGameRecord(gameId, auth.session)) {
    return sendApiError(res, 404, 'Game not found.', 'api.errors.gameNotFound');
  }

  setAccountCurrentGameId(auth.data, auth.session.accountId, gameId);
  saveAuthData(auth.data);
  auth.session.currentGameId = gameId;
  if (hasGameRuntime(gameId)) {
    switchCurrentRuntime(gameId);
  } else if (record.kind === 'SINGLEPLAYER') {
    const resumeResult = loadSingleplayerGameRecord(auth.data, auth.session, record);
    if (!resumeResult.ok) {
      return sendApiError(
        res,
        resumeResult.status,
        resumeResult.error,
        resumeResult.errorKey
      );
    }
  }

  return res.status(200).json(buildCurrentGameStatusResponse(auth.session));
});

app.post('/api/games/:gameId/close-current', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return sendApiError(res, 401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  if (!isLocalAdminSession(auth.session)) {
    return sendApiError(
      res,
      403,
      'Local admin privileges are required to close a single-player game.',
      'api.games.closeCurrent.requiresLocalAdmin'
    );
  }

  const gameId = typeof req.params.gameId === 'string' ? req.params.gameId.trim() : '';
  if (!gameId || auth.session.currentGameId !== gameId) {
    return sendApiError(
      res,
      403,
      'Select this game as your current game first.',
      'api.games.closeCurrent.selectFirst'
    );
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  if (!record) {
    return sendApiError(res, 404, 'Game not found.', 'api.errors.gameNotFound');
  }

  if (record.kind === 'MULTIPLAYER') {
    return sendApiError(
      res,
      400,
      'Use multiplayer leave/resume actions for multiplayer games.',
      'api.games.closeCurrent.useMultiplayerActions'
    );
  }

  try {
    const runtime = getGameRuntime(gameId);
    if (runtime) {
      saveRuntimeSnapshot(gameId, runtime, record.ownerAccountId ?? auth.session.accountId);
      deleteGameRuntime(gameId);
      moveMountedRuntimeAwayFromGame(gameId);
    }
    setLastClosedGameInfo(auth.data, auth.session.accountId, gameId, new Date().toISOString());
    setAccountCurrentGameId(auth.data, auth.session.accountId, null);
    auth.session.currentGameId = null;
    saveAuthData(auth.data);
    return res.status(200).json(buildCurrentGameStatusResponse(auth.session));
  } catch (error) {
    console.error('Failed to close the current single-player game.', error);
    return sendApiError(
      res,
      500,
      'Unable to close the current single-player game.',
      'api.games.closeCurrent.failed'
    );
  }
});

app.get('/api/games/:gameId/saves', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const gameId = typeof req.params.gameId === 'string' ? req.params.gameId.trim() : '';
  const record = gameId ? getGameById(GAME_REGISTRY_DATA_PATH, gameId) : null;
  if (!record || !canSessionViewGameRecord(gameId, auth.session)) {
    return res.status(404).json({ error: 'Game not found.' });
  }

  try {
    return res.status(200).json(buildGameSavesResponse(auth.session, gameId));
  } catch (error) {
    console.error('Failed to read game saves for game.', error);
    return res.status(500).json({ error: 'Unable to read game saves.' });
  }
});

app.get('/api/games/:gameId/state', (req, res) => {
  const access = resolveAuthenticatedGameAccessForGame(req, req.params.gameId, { markPresenceSeen: true });
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const response: GameStateResponse = {
    player: toPlayerSession(access.auth.session, access.galaxy),
    galaxy: buildGalaxySnapshot(access.galaxy)
  };

  return res.status(200).json(response);
});

app.get('/api/games/:gameId/turn-status', (req, res) => {
  const access = resolveAuthenticatedGameAccessForGame(req, req.params.gameId);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  return res.status(200).json(buildGameTurnStatusResponse(access));
});

app.post('/api/games/:gameId/end-turn', (req, res) => {
  return handleEndTurnRequest(req, res, req.params.gameId);
});

app.post('/api/game/start', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!isLocalAdminSession(auth.session)) {
    return res.status(403).json({ error: 'Local admin privileges are required to start a new game.' });
  }

  const body = req.body as StartGameRequest | undefined;
  if (!body || !body.setup) {
    return res.status(400).json({ error: 'Invalid setup payload.' });
  }

  const setup = normalizeGalaxySetup(body.setup);
  if (!isValidSetup(setup)) {
    return res.status(400).json({ error: 'Invalid setup payload.' });
  }

  const nextGalaxy = new GalaxyCreator(setup).createGalaxy([auth.session.playerName]);
  if (setup.smokeTestScenario) {
    applySmokeTestScenario(nextGalaxy, setup.smokeTestScenario);
  }
  synchronizeTradePortState(nextGalaxy);
  generateSelfReportsForHumanPlayers(nextGalaxy, nextGalaxy.currentTurn);
  const nextPresentation = buildPresentationDataByPlayer(nextGalaxy);
  const nextGameId = createGameId();
  let initialSaveSummary: ReturnType<typeof buildGameSaveSummary> | null = null;

  try {
    initialSaveSummary = writeRotatingAutoSave(
      GAME_SAVES_DIRECTORY_PATH,
      nextGalaxy,
      auth.session.accountId,
      setup,
      {
        rotationLimit: AUTO_SAVE_ROTATION_LIMIT,
        maxSaveFiles: MAX_GAME_SAVE_FILES,
        gameId: nextGameId
      }
    );
  } catch (error) {
    console.error('Initial game save failed.', error);
    return res.status(500).json({ error: 'Unable to save the new game.' });
  }

  currentGalaxy = nextGalaxy;
  currentGameOwnerId = auth.session.accountId;
  currentGameOwnerPlayerName = auth.session.playerName;
  currentGameSetup = setup;
  currentGalaxyPresentationByPlayer = nextPresentation;
  resetActiveTurnState();
  clearBotDecisionTracesV2();
  resetBotAdminRuntimeState();
    registerRunningGame(auth.data, 'SINGLEPLAYER', nextGalaxy, {
      gameId: nextGameId,
      ownerAccountId: auth.session.accountId,
    ownerPlayerName: auth.session.playerName,
    hostAccountId: auth.session.accountId,
    hostPlayerName: auth.session.playerName,
    currentSaveId: initialSaveSummary?.saveId ?? null,
    lastSavedAt: initialSaveSummary?.savedAt ?? null,
    currentGameAccountIds: [auth.session.accountId],
    memberships: [{
      accountId: auth.session.accountId,
      playerName: auth.session.playerName,
      role: 'OWNER'
    }]
  });

  const response: StartGameResponse = {
    player: toPlayerSession(auth.session, nextGalaxy),
    galaxy: buildGalaxySnapshot(nextGalaxy)
  };

  return res.status(200).json(response);
});

app.get('/api/game/saves', (req, res) => {
  const auth = getAuthSession(req);

  try {
    return res.status(200).json(buildGameSavesResponse(auth?.session ?? null));
  } catch (error) {
    console.error('Failed to read game saves.', error);
    return res.status(500).json({ error: 'Unable to read game saves.' });
  }
});

app.post('/api/game/saves/:saveId/load', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const save = readGameSaveById(GAME_SAVES_DIRECTORY_PATH, req.params.saveId);
    if (!save) {
      return res.status(404).json({ error: 'Saved game not found.' });
    }

    const loadAccess = resolveGameSaveLoadAccess(save, auth.session.accountId, auth.session.localAdmin === true);
    if (!loadAccess.canLoad) {
      return res.status(403).json({ error: loadAccess.canLoadReason ?? 'Forbidden.' });
    }

    const hydrated = hydrateGameSave(save);
    currentGalaxy = hydrated.galaxy;
    currentGameOwnerId = auth.session.accountId;
    currentGameOwnerPlayerName = auth.session.playerName;
    currentGameSetup = hydrated.setup;
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);
    resetActiveTurnState();
    clearBotDecisionTracesV2();
    resetBotAdminRuntimeState();
    registerRunningGame(auth.data, 'SINGLEPLAYER', currentGalaxy, {
      gameId: save.gameId ?? undefined,
      ownerAccountId: auth.session.accountId,
      ownerPlayerName: auth.session.playerName,
      hostAccountId: auth.session.accountId,
      hostPlayerName: auth.session.playerName,
      currentSaveId: req.params.saveId,
      lastSavedAt: save.savedAt,
      currentGameAccountIds: [auth.session.accountId],
      memberships: [{
        accountId: auth.session.accountId,
        playerName: auth.session.playerName,
        role: 'OWNER'
      }]
    });

    const response: LoadGameResponse = {
      player: toPlayerSession(auth.session, currentGalaxy),
      galaxy: buildGalaxySnapshot(currentGalaxy)
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Failed to load saved game.', error);
    return res.status(500).json({ error: 'Unable to load saved game.' });
  }
});

app.delete('/api/game/saves/:saveId', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!isLocalAdminSession(auth.session)) {
    return res.status(403).json({ error: 'Local admin privileges are required to manage saves.' });
  }

  try {
    const deleted = deleteGameSaveById(GAME_SAVES_DIRECTORY_PATH, req.params.saveId);
    if (!deleted) {
      return res.status(404).json({ error: 'Saved game not found.' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete saved game.', error);
    return res.status(500).json({ error: 'Unable to delete saved game.' });
  }
});

app.get('/api/multiplayer/games', (req, res) => {
  const auth = getAuthSession(req);
  if (auth) {
    reconcileLoadedRunningMultiplayerGames(auth.data);
  }
  return res.status(200).json(buildMultiplayerGameBrowserResponse(auth?.session ?? null));
});

app.post('/api/multiplayer/games', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!isLocalAdminSession(auth.session)) {
    return res.status(403).json({ error: 'Local admin privileges are required to create a multiplayer lobby.' });
  }

  const now = new Date().toISOString();
  const gameId = createGameId();
  const lobby = openMultiplayerLobby(
    auth.session.accountId,
    auth.session.playerName,
    now,
    createDefaultMultiplayerLobbySetup()
  );
  const record = createGameRecord({
    gameId,
    kind: 'MULTIPLAYER',
    status: 'DRAFT',
    name: lobby.setup.galaxyName,
    inactiveReason: null,
    ownerAccountId: auth.session.accountId,
    ownerPlayerName: auth.session.playerName,
    hostAccountId: auth.session.accountId,
    hostPlayerName: auth.session.playerName,
    currentTurn: null,
    currentSaveId: null,
    lastStartedAt: null,
    lastSavedAt: null,
    createdAt: now,
    updatedAt: now
  });
  upsertGameRecord(GAME_REGISTRY_DATA_PATH, record);
  upsertDraftLobbyWithMemberships({
    ...lobby,
    gameId,
    createdAt: now,
    updatedAt: now
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(gameId, auth.session));
});

app.get('/api/multiplayer/games/:gameId', (req, res) => {
  const auth = getAuthSession(req);
  if (auth) {
    reconcileLoadedRunningMultiplayerGames(auth.data);
  }
  const response = buildMultiplayerGameDetailResponse(req.params.gameId, auth?.session ?? null);
  if (!response) {
    return res.status(404).json({ error: 'Multiplayer game not found.' });
  }

  return res.status(200).json(response);
});

app.post('/api/multiplayer/games/:gameId/resume-lobby', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!isLocalAdminSession(auth.session)) {
    return res.status(403).json({ error: 'Local admin privileges are required to reopen an inactive multiplayer lobby.' });
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, req.params.gameId);
  if (!record || record.kind !== 'MULTIPLAYER' || record.status !== 'RUNNING' || hasGameRuntime(req.params.gameId)) {
    return res.status(404).json({ error: 'Saved inactive multiplayer game not found.' });
  }

  const existingLobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, req.params.gameId);
  if (existingLobby) {
    return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
  }

  try {
    const saveId = record.currentSaveId
      ?? listGameSaveSummariesForGame(GAME_SAVES_DIRECTORY_PATH, req.params.gameId)[0]?.saveId
      ?? null;
    if (!saveId) {
      return res.status(404).json({ error: 'No saved snapshot is available for this multiplayer game.' });
    }

    const save = readGameSaveById(GAME_SAVES_DIRECTORY_PATH, saveId);
    if (!save) {
      return res.status(404).json({ error: 'Saved snapshot not found.' });
    }

    const summary = buildGameSaveSummary(save, saveId);
    const lobby = bindSaveToLobby(
      {
        ...openMultiplayerLobby(auth.session.accountId, auth.session.playerName, new Date().toISOString()),
        isResumeLobby: true
      },
      saveId,
      save,
      summary
    );
    upsertDraftLobbyWithMemberships({
      ...lobby,
      isResumeLobby: true,
      gameId: req.params.gameId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    updateGameRecord(GAME_REGISTRY_DATA_PATH, req.params.gameId, {
      hostAccountId: auth.session.accountId,
      hostPlayerName: auth.session.playerName,
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
  } catch (error) {
    console.error('Failed to reopen inactive multiplayer game as a resume lobby.', error);
    return res.status(500).json({ error: 'Unable to reopen the saved multiplayer game.' });
  }
});

app.post('/api/multiplayer/games/:gameId/archive', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!isLocalAdminSession(auth.session)) {
    return res.status(403).json({ error: 'Local admin privileges are required to archive multiplayer games.' });
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, req.params.gameId);
  if (!record || record.kind !== 'MULTIPLAYER' || hasGameRuntime(req.params.gameId)) {
    return res.status(404).json({ error: 'Inactive multiplayer game not found.' });
  }

  deleteMultiplayerLobby(MULTIPLAYER_LOBBY_STORE_DATA_PATH, req.params.gameId);
  updateGameRecord(GAME_REGISTRY_DATA_PATH, req.params.gameId, {
    status: 'ARCHIVED',
    updatedAt: new Date().toISOString()
  });

  return res.status(204).send();
});

app.post('/api/multiplayer/games/:gameId/join', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const joinable = loadJoinableMultiplayerLobby(req.params.gameId);
  if (!joinable) {
    return res.status(404).json({ error: 'Joinable multiplayer lobby not found.' });
  }

  removeAccountFromOtherDraftMultiplayerLobbies(auth.session.accountId, req.params.gameId);
  const nextLobby = joinMultiplayerLobby(joinable.lobby, {
    accountId: auth.session.accountId,
    playerName: auth.session.playerName,
    isLocalAdmin: auth.session.localAdmin === true
  }, new Date().toISOString());
  upsertDraftLobbyWithMemberships({
    ...nextLobby,
    gameId: req.params.gameId,
    createdAt: joinable.lobby.createdAt,
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
});

app.post(['/api/multiplayer/games/:gameId/leave', '/api/multiplayer/games/:gameId/leave-lobby'], (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const joinable = loadJoinableMultiplayerLobby(req.params.gameId);
  if (!joinable) {
    return res.status(404).json({ error: 'Joinable multiplayer lobby not found.' });
  }

  if (!joinable.lobby.members.some((member) => member.accountId === auth.session.accountId)) {
    return res.status(403).json({ error: 'Join the lobby first.' });
  }

  const nextLobby = leaveMultiplayerLobby(joinable.lobby, auth.session.accountId);
  removeMembership(GAME_MEMBERSHIPS_DATA_PATH, req.params.gameId, auth.session.accountId);
  if (!nextLobby) {
    deleteMultiplayerLobby(MULTIPLAYER_LOBBY_STORE_DATA_PATH, req.params.gameId);
    updateGameRecord(GAME_REGISTRY_DATA_PATH, req.params.gameId, joinable.record.status === 'DRAFT'
      ? {
        status: 'ARCHIVED',
        updatedAt: new Date().toISOString()
      }
      : {
        updatedAt: new Date().toISOString()
      });
    return res.status(204).send();
  }

  upsertDraftLobbyWithMemberships({
    ...nextLobby,
    gameId: req.params.gameId,
    createdAt: joinable.lobby.createdAt,
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
});

app.post('/api/multiplayer/games/:gameId/leave-current-game', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, req.params.gameId);
  if (!record || record.kind !== 'MULTIPLAYER' || record.status !== 'RUNNING') {
    return res.status(404).json({ error: 'Running multiplayer game not found.' });
  }

  if (!isAccountMemberOfGame(GAME_MEMBERSHIPS_DATA_PATH, req.params.gameId, auth.session.accountId)) {
    return res.status(403).json({ error: 'Join the multiplayer game first.' });
  }

  const runtime = getGameRuntime(req.params.gameId);
  if (!runtime) {
    setAccountCurrentGameId(auth.data, auth.session.accountId, null);
    saveAuthData(auth.data);
    const response: LeaveCurrentMultiplayerGameResponse = {
      currentGameId: null,
      message: null
    };
    return res.status(200).json(response);
  }

  setAccountCurrentGameId(auth.data, auth.session.accountId, null);
  auth.session.currentGameId = null;
  removePresence(MULTIPLAYER_PRESENCE_DATA_PATH, req.params.gameId, auth.session.accountId);

  reconcileOfflineBotControlledSeatsForRuntime(req.params.gameId, runtime, auth.data);

  const presenceSummary = buildMultiplayerPresenceSummary(auth.data, req.params.gameId, runtime);
  let message: string | null = null;
  if (presenceSummary.presentHumanCount < 2) {
    saveAndUnloadRunningMultiplayerGame(req.params.gameId, runtime, record, 'LEFT_WITH_TOO_FEW_ONLINE_PLAYERS');
    message = 'Not enough online players, saving and stopping the game.';
  } else {
    moveMountedRuntimeAwayFromGame(req.params.gameId);
  }

  saveAuthData(auth.data);
  const response: LeaveCurrentMultiplayerGameResponse = {
    currentGameId: null,
    message
  };
  return res.status(200).json(response);
});

app.post('/api/multiplayer/games/:gameId/presence', (req, res) => {
  const access = resolveAuthenticatedGameAccessForGame(req, req.params.gameId, { markPresenceSeen: true });
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, req.params.gameId);
  if (!record || record.kind !== 'MULTIPLAYER' || record.status !== 'RUNNING') {
    return sendApiError(
      res,
      404,
      'Running multiplayer game not found.',
      'api.multiplayer.presence.runningGameNotFound'
    );
  }

  const body = req.body as UpdateMultiplayerAutoSkipTurnRequest | undefined;
  if (body?.acknowledgeNotice === true) {
    acknowledgeAutoSkipTurnNotice(
      MULTIPLAYER_PRESENCE_DATA_PATH,
      req.params.gameId,
      access.auth.session.accountId
    );
  }
  if (body?.acknowledgePresenceRemovedNotice === true) {
    if (clearPresenceRemovedNoticeForAccount(access.auth.data, access.auth.session.accountId, req.params.gameId)) {
      saveAuthData(access.auth.data);
      access.auth.session.pendingPresenceRemovedNoticeGameId = null;
    }
  }

  return res.status(200).json(buildGameTurnStatusResponse(access));
});

app.post('/api/multiplayer/games/:gameId/auto-skip-turn', (req, res) => {
  const access = resolveAuthenticatedGameAccessForGame(req, req.params.gameId);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, req.params.gameId);
  if (!record || record.kind !== 'MULTIPLAYER' || record.status !== 'RUNNING') {
    return sendApiError(
      res,
      404,
      'Running multiplayer game not found.',
      'api.multiplayer.presence.runningGameNotFound'
    );
  }

  const body = req.body as UpdateMultiplayerAutoSkipTurnRequest | undefined;
  if (typeof body?.enabled !== 'boolean') {
    return sendApiError(
      res,
      400,
      'Auto skip toggle requires an enabled boolean.',
      'api.multiplayer.presence.autoSkipRequiresEnabledBoolean'
    );
  }

  if (body.enabled && body.activateNow === true) {
    activateAutoSkipTurn(
      MULTIPLAYER_PRESENCE_DATA_PATH,
      req.params.gameId,
      access.auth.session.accountId
    );
  } else {
    setAutoSkipTurnEnabled(
      MULTIPLAYER_PRESENCE_DATA_PATH,
      req.params.gameId,
      access.auth.session.accountId,
      body.enabled
    );
  }

  if (body.acknowledgeNotice === true) {
    acknowledgeAutoSkipTurnNotice(
      MULTIPLAYER_PRESENCE_DATA_PATH,
      req.params.gameId,
      access.auth.session.accountId
    );
  }
  if (body.acknowledgePresenceRemovedNotice === true) {
    if (clearPresenceRemovedNoticeForAccount(access.auth.data, access.auth.session.accountId, req.params.gameId)) {
      saveAuthData(access.auth.data);
      access.auth.session.pendingPresenceRemovedNoticeGameId = null;
    }
  }

  return res.status(200).json(buildGameTurnStatusResponse(access));
});

app.post('/api/multiplayer/games/:gameId/ready', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const joinable = loadJoinableMultiplayerLobby(req.params.gameId);
  if (!joinable) {
    return res.status(404).json({ error: 'Joinable multiplayer lobby not found.' });
  }

  if (!joinable.lobby.members.some((member) => member.accountId === auth.session.accountId)) {
    return res.status(403).json({ error: 'Join the lobby first.' });
  }

  const body = req.body as ToggleMultiplayerLobbyReadyRequest | undefined;
  if (typeof body?.ready !== 'boolean') {
    return res.status(400).json({ error: 'Invalid ready payload.' });
  }

  const nextLobby = setMultiplayerLobbyMemberReady(joinable.lobby, auth.session.accountId, body.ready);
  upsertDraftLobbyWithMemberships({
    ...nextLobby,
    gameId: req.params.gameId,
    createdAt: joinable.lobby.createdAt,
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
});

app.post('/api/multiplayer/games/:gameId/setup', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const managed = loadDraftMultiplayerLobbyForManagement(auth.session, req.params.gameId);
  if (!managed) {
    return res.status(404).json({ error: 'Draft multiplayer lobby not found or not manageable.' });
  }
  if (managed.lobby.isResumeLobby) {
    return res.status(409).json({ error: 'Resume lobbies use locked saved-game settings.' });
  }

  const body = req.body as UpdateMultiplayerLobbySetupRequest | undefined;
  if (!body?.setup) {
    return res.status(400).json({ error: 'Invalid setup payload.' });
  }

  const setup = normalizeGalaxySetup({
    ...body.setup,
    playerAmount: Math.max(1, managed.lobby.members.length)
  });
  if (!isValidSetup(setup)) {
    return res.status(400).json({ error: 'Invalid setup payload.' });
  }

  const nextLobby = updateMultiplayerLobbySetup(managed.lobby, setup);
  upsertDraftLobbyWithMemberships({
    ...nextLobby,
    gameId: req.params.gameId,
    createdAt: managed.lobby.createdAt,
    updatedAt: new Date().toISOString()
  });
  updateGameRecord(GAME_REGISTRY_DATA_PATH, req.params.gameId, {
    name: nextLobby.setup.galaxyName,
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
});

app.post('/api/multiplayer/games/:gameId/bind-save', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const managed = loadDraftMultiplayerLobbyForManagement(auth.session, req.params.gameId);
  if (!managed) {
    return res.status(404).json({ error: 'Draft multiplayer lobby not found or not manageable.' });
  }
  if (managed.lobby.isResumeLobby) {
    return res.status(409).json({ error: 'Resume lobbies are already locked to their saved game.' });
  }

  try {
    const body = req.body as BindMultiplayerLobbySaveRequest | undefined;
    const saveId = typeof body?.saveId === 'string' ? body.saveId.trim() : '';
    if (!saveId) {
      return res.status(400).json({ error: 'Save selection is required.' });
    }

    const save = readGameSaveById(GAME_SAVES_DIRECTORY_PATH, saveId);
    const loadAccess = resolveGameSaveLoadAccess(save, auth.session.accountId, auth.session.localAdmin === true);
    if (!loadAccess.canLoad || !save) {
      return res.status(save ? 403 : 404).json({ error: loadAccess.canLoadReason ?? 'Saved game not found.' });
    }

    const nextLobby = bindSaveToLobby(
      managed.lobby,
      saveId,
      save,
      buildGameSaveSummary(save, saveId)
    );
    upsertDraftLobbyWithMemberships({
      ...nextLobby,
      gameId: req.params.gameId,
      createdAt: managed.lobby.createdAt,
      updatedAt: new Date().toISOString()
    });
    updateGameRecord(GAME_REGISTRY_DATA_PATH, req.params.gameId, {
      name: nextLobby.boundSave?.galaxyName ?? nextLobby.setup.galaxyName,
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
  } catch (error) {
    console.error('Failed to bind saved game to multiplayer lobby.', error);
    return res.status(500).json({ error: 'Unable to bind saved game.' });
  }
});

app.post('/api/multiplayer/games/:gameId/clear-save', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const managed = loadDraftMultiplayerLobbyForManagement(auth.session, req.params.gameId);
  if (!managed) {
    return res.status(404).json({ error: 'Draft multiplayer lobby not found or not manageable.' });
  }
  if (managed.lobby.isResumeLobby) {
    return res.status(409).json({ error: 'Resume lobbies stay locked to their saved game.' });
  }

  const nextLobby = clearLobbySaveBinding(managed.lobby);
  upsertDraftLobbyWithMemberships({
    ...nextLobby,
    gameId: req.params.gameId,
    createdAt: managed.lobby.createdAt,
    updatedAt: new Date().toISOString()
  });
  updateGameRecord(GAME_REGISTRY_DATA_PATH, req.params.gameId, {
    name: nextLobby.setup.galaxyName,
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
});

app.post('/api/multiplayer/games/:gameId/assign-seat', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const managed = loadDraftMultiplayerLobbyForManagement(auth.session, req.params.gameId);
  if (!managed) {
    return res.status(404).json({ error: 'Draft multiplayer lobby not found or not manageable.' });
  }

  const body = req.body as AssignMultiplayerLobbySeatRequest | undefined;
  const savedPlayerId = parseBodyPositiveInt(body?.savedPlayerId);
  const accountId = body?.accountId === null ? null : parseBodyPositiveInt(body?.accountId);
  if (savedPlayerId === null || (body?.accountId !== null && accountId === null)) {
    return res.status(400).json({ error: 'Invalid seat assignment payload.' });
  }

  if (!managed.lobby.loadSeats.some((seat) => seat.savedPlayerId === savedPlayerId)) {
    return res.status(404).json({ error: 'Saved human seat not found.' });
  }

  if (
    accountId !== null
    && !managed.lobby.members.some((member) => member.accountId === accountId)
  ) {
    return res.status(404).json({ error: 'Lobby member not found.' });
  }

  const nextLobby = assignLobbyLoadSeat(managed.lobby, savedPlayerId, accountId);
  upsertDraftLobbyWithMemberships({
    ...nextLobby,
    gameId: req.params.gameId,
    createdAt: managed.lobby.createdAt,
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json(buildMultiplayerGameDetailResponse(req.params.gameId, auth.session));
});

app.post('/api/multiplayer/games/:gameId/start', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const managed = loadDraftMultiplayerLobbyForManagement(auth.session, req.params.gameId);
  if (!managed) {
    return res.status(404).json({ error: 'Draft multiplayer lobby not found or not manageable.' });
  }

  const blockedReason = getMultiplayerLobbyStartBlockedReason(managed.lobby);
  if (blockedReason) {
    return res.status(409).json({ error: blockedReason });
  }

  try {
    const response = hydrateRunningMultiplayerGameFromLobby(
      auth.data,
      auth.session,
      req.params.gameId,
      managed.lobby
    );
    return res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start multiplayer game.';
    if (message === 'Saved game not found.') {
      return res.status(404).json({ error: message });
    }

    console.error('Failed to start multiplayer game.', error);
    return res.status(500).json({ error: 'Unable to start multiplayer game.' });
  }
});

app.get('/api/game/state', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req, { markPresenceSeen: true });
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const response: GameStateResponse = {
    player: toPlayerSession(access.auth.session, access.galaxy),
    galaxy: buildGalaxySnapshot(access.galaxy)
  };

  return res.status(200).json(response);
});

app.get('/api/game/turn-status', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const response: TurnStatusResponse = buildGameTurnStatusResponse(access);
  return res.status(200).json(response);
});

app.get('/api/admin/bots/traces', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const requestedPlayerId = typeof req.query.playerId === 'string'
    ? Number.parseInt(req.query.playerId, 10)
    : NaN;
  const playerId = Number.isInteger(requestedPlayerId) && requestedPlayerId > 0
    ? requestedPlayerId
    : undefined;

  return res.status(200).json({
    turn: controller.galaxy.currentTurn,
    traces: getBotDecisionTracesV2(playerId)
  });
});

app.get('/api/admin/bots', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const response: BotAdminStatesResponse = {
    turn: controller.galaxy.currentTurn,
    bots: listBotAdminStates(controller.galaxy)
  };
  return res.status(200).json(response);
});

app.post('/api/admin/bots/:playerId/profile', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const playerId = parseRoutePositiveInt(req.params.playerId);
  const profileId = normalizeBotProfileId((req.body as UpdateBotProfileRequest | undefined)?.profileId);
  if (playerId === null || !profileId) {
    return res.status(400).json({ error: 'Invalid bot profile payload.' });
  }

  const bot = controller.galaxy.botPlayerMap.get(playerId) ?? null;
  if (!bot) {
    return res.status(404).json({ error: 'Bot player not found.' });
  }

  setBotProfile(bot, profileId);
  const response: BotAdminActionResponse = {
    turn: controller.galaxy.currentTurn,
    bot: toBotAdminState(controller.galaxy, bot)
  };
  return res.status(200).json(response);
});

app.post('/api/admin/bots/:playerId/pause', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const playerId = parseRoutePositiveInt(req.params.playerId);
  const bot = playerId === null
    ? null
    : controller.galaxy.botPlayerMap.get(playerId) ?? null;
  if (!bot) {
    return res.status(404).json({ error: 'Bot player not found.' });
  }

  pauseBot(bot.playerId);
  const response: BotAdminActionResponse = {
    turn: controller.galaxy.currentTurn,
    bot: toBotAdminState(controller.galaxy, bot)
  };
  return res.status(200).json(response);
});

app.post('/api/admin/bots/:playerId/resume', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const playerId = parseRoutePositiveInt(req.params.playerId);
  const bot = playerId === null
    ? null
    : controller.galaxy.botPlayerMap.get(playerId) ?? null;
  if (!bot) {
    return res.status(404).json({ error: 'Bot player not found.' });
  }

  resumeBot(bot.playerId);
  const response: BotAdminActionResponse = {
    turn: controller.galaxy.currentTurn,
    bot: toBotAdminState(controller.galaxy, bot)
  };
  return res.status(200).json(response);
});

app.post('/api/admin/bots/:playerId/clear-memory', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const playerId = parseRoutePositiveInt(req.params.playerId);
  const bot = playerId === null
    ? null
    : controller.galaxy.botPlayerMap.get(playerId) ?? null;
  if (!bot) {
    return res.status(404).json({ error: 'Bot player not found.' });
  }

  clearBotMemory(bot);
  const response: BotAdminActionResponse = {
    turn: controller.galaxy.currentTurn,
    bot: toBotAdminState(controller.galaxy, bot)
  };
  return res.status(200).json(response);
});

app.get('/api/game/diplomacy', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  return res.status(200).json(toDiplomaticRelationDtos(access.galaxy.diplomaticRelations));
});

app.post('/api/game/diplomacy', (req, res) => {
  const controller = resolveAuthenticatedController(req);
  if ('error' in controller) {
    return res.status(controller.status).json({ error: controller.error });
  }

  const body = req.body as SetDiplomaticRelationRequest | undefined;
  const playerAId = parseBodyPositiveInt(body?.playerAId);
  const playerBId = parseBodyPositiveInt(body?.playerBId);
  const status = normalizeDiplomaticStatus(body?.status);

  if (playerAId === null || playerBId === null || !status) {
    return res.status(400).json({ error: 'Invalid diplomacy payload.' });
  }

  if (playerAId === playerBId) {
    return res.status(400).json({ error: 'Diplomacy relation must target two different players.' });
  }

  if (!resolvePlayerById(controller.galaxy, playerAId) || !resolvePlayerById(controller.galaxy, playerBId)) {
    return res.status(404).json({ error: 'One or more diplomacy players were not found.' });
  }

  upsertDiplomaticRelation(controller.galaxy, playerAId, playerBId, status);

  return res.status(200).json(toDiplomaticRelationDtos(controller.galaxy.diplomaticRelations));
});

app.get('/api/game/diplomacy-view', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  return res.status(200).json(buildDiplomacyViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/diplomacy/proposals', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as CreateDiplomaticProposalRequest | undefined;
  const targetPlayerId = parseBodyPositiveInt(body?.targetPlayerId);
  const requestedStatus = normalizeDiplomaticStatus(body?.requestedStatus);
  if (targetPlayerId === null || requestedStatus === null) {
    return res.status(400).json({ error: 'Invalid diplomacy proposal payload.' });
  }

  const result = createDiplomaticProposalCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    { targetPlayerId, requestedStatus }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  return res.status(200).json(buildDiplomacyViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/diplomacy/proposals/:proposalId/accept', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const proposalId = parseRoutePositiveInt(req.params.proposalId);
  if (proposalId === null) {
    return res.status(400).json({ error: 'Invalid diplomacy proposal id.' });
  }

  const result = approveDiplomaticProposalCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    { proposalId }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  return res.status(200).json(buildDiplomacyViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/diplomacy/proposals/:proposalId/reject', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const proposalId = parseRoutePositiveInt(req.params.proposalId);
  if (proposalId === null) {
    return res.status(400).json({ error: 'Invalid diplomacy proposal id.' });
  }

  const result = rejectDiplomaticProposalCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    { proposalId }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  return res.status(200).json(buildDiplomacyViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/diplomacy/proposals/:proposalId/cancel', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const proposalId = parseRoutePositiveInt(req.params.proposalId);
  if (proposalId === null) {
    return res.status(400).json({ error: 'Invalid diplomacy proposal id.' });
  }

  const result = cancelDiplomaticProposalCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    { proposalId }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  return res.status(200).json(buildDiplomacyViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/diplomacy/support-requests', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as CreateSupportRequestRequest | undefined;
  const targetPlayerId = parseBodyPositiveInt(body?.targetPlayerId);
  const supportType = normalizeSupportRequestType(body?.supportType);
  const targetCoordinates = parseBodyCoordinates(body?.targetCoordinates);
  const missionType = normalizeFleetMissionType(body?.missionType);
  const minimumShips = parseSupportShipAmounts(body?.minimumShips);
  const bombardmentPriorities = parseBombardmentPriorities(body?.bombardmentPriorities);
  const requestedResources = normalizeSupportResources(body?.requestedResources);
  if (
    targetPlayerId === null
    || supportType === null
    || targetCoordinates === null
    || (body?.missionType !== undefined && missionType === null)
    || (body?.minimumShips !== undefined && minimumShips === null)
    || (body?.bombardmentPriorities !== undefined
      && body?.bombardmentPriorities !== null
      && bombardmentPriorities === null)
  ) {
    return res.status(400).json({ error: 'Invalid support request payload.' });
  }

  const result = createSupportRequestCommand(
    authPlayer.galaxy,
    authPlayer.player.playerId,
    targetPlayerId,
    supportType,
    targetCoordinates,
    requestedResources,
    missionType,
    minimumShips ?? [],
    bombardmentPriorities
  );
  if ('error' in result) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json(buildDiplomacyViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.get('/api/game/mail', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/messages/read', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as MarkMailMessageReadRequest | undefined;
  const messageId = parseBodyNonNegativeInt(body?.messageId);
  if (messageId === null) {
    return res.status(400).json({ error: 'Invalid message id.' });
  }

  if (!authPlayer.player.markMessageAsRead(messageId)) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  return res.status(204).send();
});

app.post('/api/game/mail/messages/delete', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as DeleteMailMessagesRequest | undefined;
  const messageIds = parseBodyReportIds(body?.messageIds);
  if (!messageIds) {
    return res.status(400).json({ error: 'Invalid message ids.' });
  }

  const deletedCount = authPlayer.player.deleteMessages(messageIds);
  const response: DeleteMailMessagesResponse = { deletedCount };
  return res.status(200).json(response);
});

app.post('/api/game/mail/requests/delete', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as DeleteMailRequestsRequest | undefined;
  const requestRefs = parseDeleteMailRequestRefs(body?.requests);
  if (!requestRefs) {
    return res.status(400).json({ error: 'Invalid request references.' });
  }

  let deletedCount = 0;
  const diplomacyRequestIds = new Set(
    requestRefs
      .filter((entry) => entry.requestType === 'DIPLOMACY_PROPOSAL')
      .map((entry) => entry.requestId)
  );
  const maintenanceRequestIds = new Set(
    requestRefs
      .filter((entry) => entry.requestType === 'MAINTENANCE')
      .map((entry) => entry.requestId)
  );
  const jumpGateRequestIds = new Set(
    requestRefs
      .filter((entry) => entry.requestType === 'JUMP_GATE')
      .map((entry) => entry.requestId)
  );
  const supportRequestIds = new Set(
    requestRefs
      .filter((entry) => entry.requestType === 'SUPPORT')
      .map((entry) => entry.requestId)
  );

  const deletableDiplomacyIds = new Set(
    authPlayer.galaxy.diplomaticProposals
      .filter((proposal) =>
        diplomacyRequestIds.has(proposal.proposalId)
        && proposal.state !== DiplomaticProposalState.PENDING
        && (proposal.fromPlayerId === authPlayer.player.playerId || proposal.toPlayerId === authPlayer.player.playerId)
      )
      .map((proposal) => proposal.proposalId)
  );
  const diplomacyBefore = authPlayer.galaxy.diplomaticProposals.length;
  authPlayer.galaxy.diplomaticProposals = authPlayer.galaxy.diplomaticProposals.filter((proposal) =>
    !deletableDiplomacyIds.has(proposal.proposalId)
  );
  deletedCount += diplomacyBefore - authPlayer.galaxy.diplomaticProposals.length;

  const deletableMaintenanceIds = new Set(
    authPlayer.galaxy.maintenanceRequests
      .filter((request) =>
        maintenanceRequestIds.has(request.requestId)
        && request.state !== DiplomaticProposalState.PENDING
        && (request.fromPlayerId === authPlayer.player.playerId || request.toPlayerId === authPlayer.player.playerId)
      )
      .map((request) => request.requestId)
  );
  const maintenanceBefore = authPlayer.galaxy.maintenanceRequests.length;
  authPlayer.galaxy.maintenanceRequests = authPlayer.galaxy.maintenanceRequests.filter((request) =>
    !deletableMaintenanceIds.has(request.requestId)
  );
  deletedCount += maintenanceBefore - authPlayer.galaxy.maintenanceRequests.length;

  const deletableJumpGateIds = new Set(
    authPlayer.galaxy.jumpGateRequests
      .filter((request) =>
        jumpGateRequestIds.has(request.requestId)
        && request.state !== DiplomaticProposalState.PENDING
        && (request.fromPlayerId === authPlayer.player.playerId || request.toPlayerId === authPlayer.player.playerId)
      )
      .map((request) => request.requestId)
  );
  const jumpGateBefore = authPlayer.galaxy.jumpGateRequests.length;
  authPlayer.galaxy.jumpGateRequests = authPlayer.galaxy.jumpGateRequests.filter((request) =>
    !deletableJumpGateIds.has(request.requestId)
  );
  deletedCount += jumpGateBefore - authPlayer.galaxy.jumpGateRequests.length;

  const deletableSupportIds = new Set(
    authPlayer.galaxy.supportRequests
      .filter((request) =>
        supportRequestIds.has(request.requestId)
        && request.state !== DiplomaticProposalState.PENDING
        && (request.fromPlayerId === authPlayer.player.playerId || request.toPlayerId === authPlayer.player.playerId)
      )
      .map((request) => request.requestId)
  );
  const supportBefore = authPlayer.galaxy.supportRequests.length;
  authPlayer.galaxy.supportRequests = authPlayer.galaxy.supportRequests.filter((request) =>
    !deletableSupportIds.has(request.requestId)
  );
  deletedCount += supportBefore - authPlayer.galaxy.supportRequests.length;

  const response: DeleteMailRequestsResponse = {
    deletedCount
  };
  return res.status(200).json(response);
});

app.post('/api/game/mail/maintenance-requests/:requestId/approve', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid maintenance request id.' });
  }

  const request = authPlayer.galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Maintenance request not found.' });
  }

  if (request.toPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only the target player can approve this request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Maintenance request is no longer pending.' });
  }

  const body = req.body as ResolveMaintenanceRequestRequest | undefined;
  const requestedApproval = normalizeMaintenanceTransferPayload(body);
  const result = approveFleetMaintenanceRequest(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    requestId,
    isExplicitMaintenancePayload(body) ? requestedApproval : null
  );
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }

  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/maintenance-requests/:requestId/reject', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid maintenance request id.' });
  }

  const request = authPlayer.galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Maintenance request not found.' });
  }

  if (request.toPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only the target player can reject this request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Maintenance request is no longer pending.' });
  }

  const result = rejectFleetMaintenanceRequest(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    requestId
  );
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }
  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/maintenance-requests/:requestId/cancel', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid maintenance request id.' });
  }

  const request = authPlayer.galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Maintenance request not found.' });
  }

  if (request.fromPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only the requesting player can cancel this request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Maintenance request is no longer pending.' });
  }

  const result = cancelFleetMaintenanceRequest(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    requestId
  );
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }
  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/jump-gate-requests/:requestId/approve', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid Jump Gate request id.' });
  }

  const request = authPlayer.galaxy.jumpGateRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Jump Gate request not found.' });
  }

  if (request.toPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'You cannot approve this Jump Gate request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Jump Gate request is no longer pending.' });
  }

  const result = approveJumpGateRequestCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    requestId
  );
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }

  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/jump-gate-requests/:requestId/reject', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid Jump Gate request id.' });
  }

  const request = authPlayer.galaxy.jumpGateRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Jump Gate request not found.' });
  }

  if (request.toPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'You cannot reject this Jump Gate request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Jump Gate request is no longer pending.' });
  }

  const result = rejectJumpGateRequestCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    requestId
  );
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }
  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/jump-gate-requests/:requestId/cancel', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid Jump Gate request id.' });
  }

  const request = authPlayer.galaxy.jumpGateRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Jump Gate request not found.' });
  }

  if (request.fromPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'You cannot cancel this Jump Gate request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Jump Gate request is no longer pending.' });
  }

  const result = cancelJumpGateRequestCommand(
    { galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId },
    requestId
  );
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }
  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/support-requests/:requestId/approve', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = parseRoutePositiveInt(req.params.requestId);
  if (requestId === null) {
    return res.status(400).json({ error: 'Invalid support request id.' });
  }

  const request = authPlayer.galaxy.supportRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Support request not found.' });
  }

  if (request.toPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only the target player can approve this request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Support request is no longer pending.' });
  }

  const body = req.body as ResolveSupportRequestRequest | undefined;
  const approvedResources = normalizeSupportResources(body?.approvedResources);
  const result = approveSupportRequest(authPlayer.galaxy, request, approvedResources);
  if ('error' in result) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/support-requests/:requestId/reject', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = parseRoutePositiveInt(req.params.requestId);
  if (requestId === null) {
    return res.status(400).json({ error: 'Invalid support request id.' });
  }

  const request = authPlayer.galaxy.supportRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Support request not found.' });
  }

  if (request.toPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only the target player can reject this request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Support request is no longer pending.' });
  }

  rejectSupportRequest(
    authPlayer.galaxy,
    request,
    'Support request rejected.',
    'You rejected the support request.'
  );
  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/support-requests/:requestId/cancel', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const requestId = parseRoutePositiveInt(req.params.requestId);
  if (requestId === null) {
    return res.status(400).json({ error: 'Invalid support request id.' });
  }

  const request = authPlayer.galaxy.supportRequests.find((entry) => entry.requestId === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Support request not found.' });
  }

  if (request.fromPlayerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only the requesting player can cancel this request.' });
  }

  if (request.state !== DiplomaticProposalState.PENDING) {
    return res.status(409).json({ error: 'Support request is no longer pending.' });
  }

  cancelSupportRequest(
    authPlayer.galaxy,
    request,
    'Support request cancelled.',
    'The support request was cancelled by the requester.'
  );
  return res.status(200).json(buildMailViewResponse(authPlayer.galaxy, authPlayer.player));
});

app.post('/api/game/mail/messages/send', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as SendMailMessageRequest | undefined;
  const recipientMode = normalizeMailRecipientMode(body?.recipientMode);
  const targetPlayerId = parseBodyPositiveInt(body?.targetPlayerId);
  const title = normalizePlayerMessageTitle(body?.title);
  const messageBody = normalizePlayerMessageBody(body?.body);
  if (recipientMode === null || title === null || messageBody === null) {
    return res.status(400).json({ error: 'Invalid mail message payload.' });
  }

  if (recipientMode === 'player') {
    if (targetPlayerId === null) {
      return res.status(400).json({ error: 'Select a message target.' });
    }

    const targetPlayer = resolvePlayerById(authPlayer.galaxy, targetPlayerId);
    if (!targetPlayer || targetPlayer.playerId === authPlayer.player.playerId) {
      return res.status(404).json({ error: 'Message target not found.' });
    }

    if (!canSendDirectMailToPlayer(authPlayer.galaxy, authPlayer.player.playerId, targetPlayer.playerId)) {
      return res.status(403).json({ error: 'Target player is not available for direct mail.' });
    }

    addPlayerMessage(
      targetPlayer,
      authPlayer.galaxy.currentTurn,
      title,
      messageBody,
      authPlayer.player.playerId,
      authPlayer.player.playerName
    );

    const response: SendMailMessageResponse = { deliveredCount: 1 };
    return res.status(200).json(response);
  }

  const allianceRecipients = resolveAllianceMailRecipients(authPlayer.galaxy, authPlayer.player.playerId);
  if (allianceRecipients.length === 0) {
    return res.status(409).json({ error: 'No allied human players are currently available for alliance mail.' });
  }

  for (const recipient of allianceRecipients) {
    addPlayerMessage(
      recipient,
      authPlayer.galaxy.currentTurn,
      title,
      messageBody,
      authPlayer.player.playerId,
      authPlayer.player.playerName
    );
  }

  const response: SendMailMessageResponse = { deliveredCount: allianceRecipients.length };
  return res.status(200).json(response);
});

app.post('/api/game/end-turn', (req, res) => {
  return handleEndTurnRequest(req, res);
});

app.get('/api/game/galaxy-presentation-data', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const presentation = getPresentationData(access.galaxy, access.playerId);
  const starSystemNotes = GalaxyPresentationData.collectStarSystemNotes(access.galaxy, access.playerId);
  const response: GalaxyPresentationDataDto = toGalaxyPresentationDataDto(
    presentation,
    starSystemNotes
  );
  return res.status(200).json(response);
});

app.post('/api/game/star-system-note', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const body = req.body as UpsertStarSystemNoteRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const borderColor = normalizeStarSystemNoteBorderColor(body?.borderColor);
  const text = normalizeStarSystemNoteText(body?.text);

  if (x === null || y === null || !borderColor || !text) {
    return res.status(400).json({ error: 'Invalid star system note payload.' });
  }

  const system = access.galaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  if (system.isVoid || system.isGalaxyCenter) {
    return res.status(400).json({ error: 'Cannot set note for Void or Galaxy Center.' });
  }

  const note = new StarSystemNote({ x, y }, borderColor, text);
  system.starSystemNotes.set(access.playerId, note);

  const response: StarSystemNoteDto = toStarSystemNoteDto(note);
  return res.status(200).json(response);
});

app.delete('/api/game/star-system-note', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  if (x === null || y === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  const system = access.galaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  if (system.isVoid || system.isGalaxyCenter) {
    return res.status(400).json({ error: 'Cannot delete note for Void or Galaxy Center.' });
  }

  system.starSystemNotes.delete(access.playerId);
  return res.status(204).send();
});

app.get('/api/game/client-galaxy', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const includePlanets = parseIncludePlanets(req.query.includePlanets);
  const clientGalaxy = access.galaxy.createClientGalaxy(access.playerId, includePlanets);
  const response: ClientGalaxyDto = toClientGalaxyDto(clientGalaxy, includePlanets);
  return res.status(200).json(response);
});

app.get('/api/game/client-star-system', (req, res) => {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  const z = parseOptionalInt(req.query.z);
  if (x === null || y === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }
  if (z !== null && z >= 0) {
    return res.status(400).json({ error: 'z must be < 0 for star system requests.' });
  }

  const system = access.galaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const clientSystem = access.galaxy.createClientStarSystem(system, access.playerId, true);
  const response: ClientStarSystemDto = toClientStarSystemDto(clientSystem, true);
  return res.status(200).json(response);
});

app.get('/api/game/client-planet', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  const z = parseNonNegativeInt(req.query.z);
  const ownedOnly = parseBooleanFlag(req.query.ownedOnly);
  if (x === null || y === null || z === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  if (synchronizeTradePortState(currentGalaxy)) {
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);
  }
  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  if (ownedOnly && !clientPlanet.isOwnedByViewer) {
    return res.status(403).json({ error: 'Planet view is available only for your own planets.' });
  }
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, {
    x,
    y,
    z
  });
  return res.status(200).json(response);
});

app.get('/api/game/sensor-phalanx/capabilities', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  const z = parseNonNegativeInt(req.query.z);
  if (x === null || y === null || z === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  const planet = authPlayer.galaxy.stars[y]?.[x]?.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Sensor Phalanx can be used only on your own planet.' });
  }

  const origin = { x, y, z };
  planet.synchronizeSensorPhalanxTurn(authPlayer.galaxy.currentTurn);
  const response = toSensorPhalanxCapabilitiesDto(planet, origin, authPlayer.galaxy.currentTurn);
  return res.status(200).json(response);
});

app.post('/api/game/sensor-phalanx/scan', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as SensorPhalanxScanRequest | undefined;
  const origin = parseBodyCoordinates(body?.origin);
  const target = parseBodyCoordinates(body?.target);
  if (!origin || !target) {
    return res.status(400).json({ error: 'Invalid sensor phalanx scan payload.' });
  }

  const originPlanet = resolvePlanetAtCoordinates(authPlayer.galaxy, origin);
  if (!originPlanet) {
    return res.status(404).json({ error: 'Origin planet not found.' });
  }

  if (originPlanet.info.ownerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Sensor Phalanx can be used only on your own planet.' });
  }

  const targetPlanet = resolvePlanetAtCoordinates(authPlayer.galaxy, target);
  if (!targetPlanet) {
    return res.status(404).json({ error: 'Target planet not found.' });
  }

  originPlanet.synchronizeSensorPhalanxTurn(authPlayer.galaxy.currentTurn);
  const phalanxLevel = originPlanet.getBuildingLevel(BuildingType.SENSOR_PHALANX as BuildingTypeType);
  if (phalanxLevel <= 0 || originPlanet.getSensorPhalanxNormalRange() <= 0) {
    return res.status(409).json({ error: 'Sensor Phalanx is not operational on the origin planet.' });
  }

  const activeScanRange = originPlanet.getSensorPhalanxActiveScanRange();
  const distance = calculateTravelDistance(origin, target);
  if (distance > activeScanRange) {
    return res.status(409).json({ error: `Target planet is outside Sensor Phalanx scan range (${activeScanRange}).` });
  }

  const scanCost = originPlanet.getSensorPhalanxScanCost();
  if (originPlanet.rBDSFTQ.resources.deuterium < scanCost) {
    return res.status(409).json({ error: 'Not enough deuterium on the origin planet for a Sensor Phalanx scan.' });
  }

  if (!originPlanet.consumeSensorPhalanxScan(authPlayer.galaxy.currentTurn)) {
    return res.status(409).json({ error: 'No Sensor Phalanx scans remain on this planet for the current turn.' });
  }

  originPlanet.rBDSFTQ.resources.deuterium -= scanCost;
  const response = buildSensorPhalanxScanResponse(
    authPlayer.galaxy,
    authPlayer.player.playerId,
    originPlanet,
    origin,
    targetPlanet,
    target
  );

  currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(authPlayer.galaxy);
  return res.status(200).json(response);
});

app.post('/api/game/abandon-planet', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as AbandonPlanetRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  if (x === null || y === null || z === null) {
    return res.status(400).json({ error: 'Invalid abandon-planet payload.' });
  }

  const system = authPlayer.galaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Only your own planets can be abandoned.' });
  }

  if (authPlayer.player.planets.length <= 1) {
    return res.status(400).json({ error: 'Your last owned planet cannot be abandoned.' });
  }

  const neutralOwner = abandonPlanetToNewNeutralOwner(authPlayer.galaxy, authPlayer.player, planet);
  upsertDiplomaticRelation(
    authPlayer.galaxy,
    authPlayer.player.playerId,
    neutralOwner.playerId,
    DiplomaticStatus.PASSIVE
  );
  refreshPlanetIntelForPlayer(
    authPlayer.player,
    neutralOwner,
    planet,
    authPlayer.galaxy.currentTurn
  );
  currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(authPlayer.galaxy);

  const presentation = getPresentationData(authPlayer.galaxy, authPlayer.player.playerId);
  const response: AbandonPlanetResponse = {
    ownedPlanets: presentation.ownedPlanets.map((entry) => toClientPlanetDtoFromClientPlanet(entry))
  };
  return res.status(200).json(response);
});

app.post('/api/game/trade-port/use-offer', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const body = req.body as UseTradePortOfferRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const offerId = parseBodyNonNegativeInt(body?.offerId);
  if (x === null || y === null || z === null || offerId === null) {
    return res.status(400).json({ error: 'Invalid trade offer payload.' });
  }

  const planet = authPlayer.galaxy.stars[y]?.[x]?.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== authPlayer.player.playerId) {
    return res.status(403).json({ error: 'Trade offers can be used only on your own planet.' });
  }

  if (synchronizeTradePortState(authPlayer.galaxy)) {
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(authPlayer.galaxy);
  }

  const tradePortLevel = planet.getBuildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT);
  if (tradePortLevel <= 0) {
    return res.status(400).json({ error: 'Interstellar Trade Port is not built on this planet.' });
  }

  const offer = planet.rBDSFTQ.tradePortOffers.find((entry) => entry.offerId === offerId);
  if (!offer || offer.turn !== authPlayer.galaxy.currentTurn) {
    return res.status(404).json({ error: 'Trade offer not found for the current turn.' });
  }

  if (offer.used) {
    return res.status(409).json({ error: 'This trade offer was already used this turn.' });
  }

  const currentResourceAmount = resourceAmountForType(planet.rBDSFTQ.resources, offer.costResourceType);
  if (currentResourceAmount < offer.totalCost) {
    return res.status(409).json({ error: 'Not enough local resources to use this trade offer.' });
  }

  subtractResourceAmountByType(planet.rBDSFTQ.resources, offer.costResourceType, offer.totalCost);
  addResourceAmountByType(planet.rBDSFTQ.resources, offer.getResourceType, offer.getAmount);
  offer.used = true;

  currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(authPlayer.galaxy);
  const clientPlanet = authPlayer.galaxy.createClientPlanet(planet, authPlayer.player.playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/building-queue', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as StartBuildingConstructionRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const buildingType = normalizeBuildingType(body?.buildingType);
  if (x === null || y === null || z === null || !buildingType) {
    return res.status(400).json({ error: 'Invalid building queue payload.' });
  }

  const result = startBuildingConstruction(
    { galaxy: currentGalaxy, playerId },
    { x, y, z, buildingType }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  const clientPlanet = currentGalaxy.createClientPlanet(result.value.planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/building-queue/reorder', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as ReorderBuildingQueueRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const fromIndex = parseBodyNonNegativeInt(body?.fromIndex);
  const toIndex = parseBodyNonNegativeInt(body?.toIndex);
  if (x === null || y === null || z === null || fromIndex === null || toIndex === null) {
    return res.status(400).json({ error: 'Invalid building queue reorder payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueLength = planet.rBDSFTQ.buildingQueue.length;
  if (fromIndex >= queueLength || toIndex >= queueLength) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  if (fromIndex !== toIndex) {
    moveQueueEntry(planet.rBDSFTQ.buildingQueue, fromIndex, toIndex);
  }

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/building-queue/cancel', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CancelBuildingQueueEntryRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const index = parseBodyNonNegativeInt(body?.index);
  if (x === null || y === null || z === null || index === null) {
    return res.status(400).json({ error: 'Invalid building queue cancel payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueEntry = planet.rBDSFTQ.buildingQueue[index];
  if (!queueEntry) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  const building = BUILDING_BLUEPRINTS.get(queueEntry.buildingType);
  if (!building) {
    return res.status(400).json({ error: 'Unknown queued building type.' });
  }

  const refund = calculateBuildingCancellationRefund(building, queueEntry);
  planet.rBDSFTQ.resources.addResourcePack(refund);
  planet.rBDSFTQ.buildingQueue.splice(index, 1);

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/shipyard-queue', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as StartShipyardConstructionRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const itemKind = body?.itemKind === 'defence' ? 'defence' : body?.itemKind === 'ship' ? 'ship' : null;
  const shipType = normalizeShipType(body?.shipType);
  const defenceType = normalizeDefenceType(body?.defenceType);
  const amount = parseBodyIntInRange(body?.amount, 1, 100000);
  if (
    x === null
    || y === null
    || z === null
    || !itemKind
    || amount === null
    || (itemKind === 'ship' && !shipType)
    || (itemKind === 'defence' && !defenceType)
  ) {
    return res.status(400).json({ error: 'Invalid shipyard queue payload.' });
  }

  const result = startShipyardConstruction(
    { galaxy: currentGalaxy, playerId },
    { x, y, z, itemKind, shipType, defenceType, amount }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  const clientPlanet = currentGalaxy.createClientPlanet(result.value.planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/shipyard-queue/reorder', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as ReorderShipyardQueueRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const fromIndex = parseBodyNonNegativeInt(body?.fromIndex);
  const toIndex = parseBodyNonNegativeInt(body?.toIndex);
  if (x === null || y === null || z === null || fromIndex === null || toIndex === null) {
    return res.status(400).json({ error: 'Invalid shipyard queue reorder payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueLength = planet.rBDSFTQ.shipyardQueue.length;
  if (fromIndex >= queueLength || toIndex >= queueLength) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  if (fromIndex !== toIndex) {
    moveQueueEntry(planet.rBDSFTQ.shipyardQueue, fromIndex, toIndex);
  }

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/shipyard-queue/cancel', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CancelShipyardQueueEntryRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const index = parseBodyNonNegativeInt(body?.index);
  if (x === null || y === null || z === null || index === null) {
    return res.status(400).json({ error: 'Invalid shipyard queue cancel payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueEntry = planet.rBDSFTQ.shipyardQueue[index];
  if (!queueEntry) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  const blueprint = queueEntry.itemKind === 'defence'
    ? (queueEntry.defenceType ? DEFENCE_BLUEPRINTS.get(queueEntry.defenceType) : null)
    : (queueEntry.shipType ? SHIP_BLUEPRINTS.get(queueEntry.shipType) : null);
  if (!blueprint) {
    return res.status(400).json({ error: 'Unknown queued shipyard item type.' });
  }

  const cancellation = calculateShipyardCancellation(blueprint, queueEntry);
  if (cancellation.deliveredAmount > 0) {
    addProducedShipyardUnitsToPlanet(planet, blueprint, queueEntry.itemKind, cancellation.deliveredAmount);
  }
  planet.rBDSFTQ.resources.addResourcePack(cancellation.refund);
  planet.rBDSFTQ.shipyardQueue.splice(index, 1);

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/technology-queue', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as StartTechnologyResearchRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const technologyType = normalizeTechnologyType(body?.technologyType);
  const helperCoordinates = parseResearchHelperCoordinates(body?.helperPlanets);
  if (x === null || y === null || z === null || !technologyType || helperCoordinates === null) {
    return res.status(400).json({ error: 'Invalid technology queue payload.' });
  }

  const result = startTechnologyResearch(
    { galaxy: currentGalaxy, playerId },
    { x, y, z, technologyType, helperPlanets: helperCoordinates }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  const presentation = getPresentationData(currentGalaxy, playerId);
  const response = presentation.ownedPlanets.map((entry) => toClientPlanetDtoFromClientPlanet(entry));
  return res.status(200).json(response);
});

app.post('/api/game/technology-queue/helpers', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as UpdateResearchHelpersRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const helperCoordinates = parseResearchHelperCoordinates(body?.helperPlanets);
  if (x === null || y === null || z === null || helperCoordinates === null) {
    return res.status(400).json({ error: 'Invalid research helper payload.' });
  }

  const result = updateResearchHelpers(
    { galaxy: currentGalaxy, playerId },
    { x, y, z, helperPlanets: helperCoordinates }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  const presentation = getPresentationData(currentGalaxy, playerId);
  const response = presentation.ownedPlanets.map((entry) => toClientPlanetDtoFromClientPlanet(entry));
  return res.status(200).json(response);
});

app.post('/api/game/power-consumption', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as SetBuildingPowerConsumptionRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const buildingType = normalizeBuildingType(body?.buildingType);
  const currentPowerConsumption = parseBodyNonNegativeNumber(body?.currentPowerConsumption);

  if (x === null || y === null || z === null || !buildingType || currentPowerConsumption === null) {
    return res.status(400).json({ error: 'Invalid power consumption payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const maxConsumption = planet.getMaxBuildingPowerConsumption(buildingType);
  const powerPerLevel = BUILDING_BLUEPRINTS.get(buildingType)?.powerConsumption ?? 0;
  if (maxConsumption <= 0 && currentPowerConsumption > 0) {
    return res.status(400).json({ error: 'Building has no available power consumption.' });
  }

  if (powerPerLevel > 0) {
    const withinBounds = currentPowerConsumption >= 0 && currentPowerConsumption <= maxConsumption;
    const ratio = currentPowerConsumption / powerPerLevel;
    const isMultiple = Math.abs(ratio - Math.round(ratio)) < 1e-9;
    if (!withinBounds || !isMultiple) {
      return res.status(400).json({ error: 'Invalid power consumption value for current building level.' });
    }
  }

  const updatedPowerConsumption = planet.setCurrentBuildingPowerConsumption(
    buildingType,
    currentPowerConsumption
  );

  const response: SetBuildingPowerConsumptionResponse = {
    buildingType,
    currentPowerConsumption: updatedPowerConsumption
  };
  return res.status(200).json(response);
});

app.post('/api/game/fusion-reactor-stage', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as SetFusionReactorStageRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const selectedStage = parseBodyNonNegativeInt(body?.selectedStage);

  if (x === null || y === null || z === null || selectedStage === null) {
    return res.status(400).json({ error: 'Invalid fusion reactor stage payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const maxStage = planet.getMaxFusionReactorStage();
  if (selectedStage > maxStage) {
    return res.status(400).json({ error: 'Invalid fusion reactor stage for current building level.' });
  }

  const response: SetFusionReactorStageResponse = {
    selectedStage: planet.setFusionReactorSelectedStage(selectedStage)
  };
  return res.status(200).json(response);
});

app.get('/api/game/owned-planets', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  if (synchronizeTradePortState(currentGalaxy)) {
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);
  }
  const presentation = getPresentationData(currentGalaxy, playerId);
  const response = presentation.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet));
  return res.status(200).json(response);
});

app.get('/api/game/reports', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const response = [...player.reports]
    .filter((report) => report.reportType !== ReportType.MESSAGE)
    .sort((left, right) => right.createdTurn - left.createdTurn || right.reportId - left.reportId)
    .map((report) => toPlayerReportDto(report));
  return res.status(200).json(response);
});

app.post('/api/game/reports/read', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as MarkPlayerReportReadRequest | undefined;
  const reportId = parseBodyNonNegativeInt(body?.reportId);
  if (reportId === null) {
    return res.status(400).json({ error: 'Invalid report id.' });
  }

  const wasUpdated = player.markReportAsRead(reportId);
  if (!wasUpdated) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  const report = player.reports.find((entry) => entry.reportId === reportId);
  if (!report) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  return res.status(200).json(toPlayerReportDto(report));
});

app.post('/api/game/reports/delete', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as DeletePlayerReportsRequest | undefined;
  const reportIds = parseBodyReportIds(body?.reportIds);
  if (!reportIds) {
    return res.status(400).json({ error: 'Invalid report ids.' });
  }

  const deletedCount = player.deleteReports(reportIds);
  const response: DeletePlayerReportsResponse = { deletedCount };
  return res.status(200).json(response);
});

app.post('/api/game/tutorial-read', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as { viewKey?: string; markAllRead?: boolean } | undefined;
  if (body?.markAllRead === true) {
    player.markAllTutorialsRead();
    return res.status(200).json(toPlayerSession(auth.session, currentGalaxy));
  }

  if (!body?.viewKey || !TUTORIAL_VIEW_KEY_VALUES.has(body.viewKey)) {
    return res.status(400).json({ error: 'Invalid tutorial view key.' });
  }

  player.markTutorialRead(body.viewKey as keyof typeof player.tutorialRead);
  return res.status(200).json(toPlayerSession(auth.session, currentGalaxy));
});

app.get('/api/game/active-fleets', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const response = buildOwnedActiveFleetsResponse(currentGalaxy, playerId);
  return res.status(200).json(response);
});

app.get('/api/game/active-fleets/:fleetId/maintenance-options', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const fleetId = Number.parseInt(req.params.fleetId, 10);
  if (!Number.isInteger(fleetId) || fleetId <= 0) {
    return res.status(400).json({ error: 'Invalid fleet id.' });
  }

  const result = resolveFleetMaintenanceOptions({ galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId }, fleetId);
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }

  return res.status(200).json(result.value);
});

app.post('/api/game/active-fleets/:fleetId/maintenance-request', (req, res) => {
  const authPlayer = resolveAuthenticatedGamePlayer(req);
  if ('error' in authPlayer) {
    return sendApiRouteError(res, authPlayer);
  }

  const fleetId = Number.parseInt(req.params.fleetId, 10);
  if (!Number.isInteger(fleetId) || fleetId <= 0) {
    return res.status(400).json({ error: 'Invalid fleet id.' });
  }

  const body = req.body as CreateMaintenanceRequestRequest | undefined;
  const payload = normalizeMaintenanceTransferPayload(body);
  const result = createFleetMaintenanceRequest({ galaxy: authPlayer.galaxy, playerId: authPlayer.player.playerId }, fleetId, payload);
  if (!result.ok) {
    return res.status(result.error.status).json({ error: result.error.message });
  }

  const response: CreateMaintenanceRequestResponse = {
    activeFleets: buildOwnedActiveFleetsResponse(authPlayer.galaxy, authPlayer.player.playerId),
    mode: result.value.mode,
    message: result.value.message
  };
  return res.status(200).json(response);
});

app.post('/api/game/active-fleets/:fleetId/return', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const fleetId = Number.parseInt(req.params.fleetId, 10);
  if (!Number.isInteger(fleetId) || fleetId <= 0) {
    return res.status(400).json({ error: 'Invalid fleet id.' });
  }

  const fleet = currentGalaxy.activeFleets.find((entry) => entry.fleetId === fleetId && entry.ownerId === playerId);
  if (!fleet) {
    return res.status(404).json({ error: 'Fleet not found.' });
  }

  if (fleet.state === FleetState.PENDING_JUMP_GATE) {
    const pendingRequest = findPendingJumpGateRequestForFleet(currentGalaxy, playerId, fleetId);
    if (pendingRequest) {
      pendingRequest.state = DiplomaticProposalState.CANCELLED;
    }
    restorePendingJumpGateFleetToOrigin(currentGalaxy, fleet, true);
    return res.status(200).json(buildOwnedActiveFleetsResponse(currentGalaxy, playerId));
  }

  if (fleet.state === FleetState.RETURNING || fleet.state === FleetState.MISSION_FAILURE_RETURNING) {
    return res.status(200).json(buildOwnedActiveFleetsResponse(currentGalaxy, playerId));
  }

  if (fleet.state !== FleetState.MOVING_TO_TARGET && fleet.state !== FleetState.ORBITING) {
    return res.status(400).json({ error: 'Fleet cannot return from its current state.' });
  }

  if (fleet.state === FleetState.MOVING_TO_TARGET) {
    const elapsedTravelTurns = Math.max(
      0,
      Math.min(fleet.travelTurns, currentGalaxy.currentTurn - fleet.createdAtTurn)
    );
    fleet.returnTurns = Math.max(1, elapsedTravelTurns);
  }

  fleet.state = FleetState.RETURNING;
  fleet.orbitActivity = FleetOrbitActivity.IDLE;
  fleet.suspendedMissionType = null;
  fleet.returnReason = FleetReturnReason.MANUAL_RECALL;
  fleet.createdAtTurn = currentGalaxy.currentTurn;

  synchronizeJumpGateRequests(currentGalaxy);
  synchronizeMaintenanceRequests(currentGalaxy);
  synchronizeSupportRequests(currentGalaxy);
  return res.status(200).json(buildOwnedActiveFleetsResponse(currentGalaxy, playerId));
});

app.post('/api/game/active-fleets/:fleetId/delay', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const fleetId = Number.parseInt(req.params.fleetId, 10);
  if (!Number.isInteger(fleetId) || fleetId <= 0) {
    return res.status(400).json({ error: 'Invalid fleet id.' });
  }

  const fleet = currentGalaxy.activeFleets.find((entry) => entry.fleetId === fleetId && entry.ownerId === playerId);
  if (!fleet) {
    return res.status(404).json({ error: 'Fleet not found.' });
  }

  if (fleet.state !== FleetState.MOVING_TO_TARGET) {
    return res.status(400).json({ error: 'Delay is available only for outbound fleets.' });
  }

  // TODO: Support adding delay to RETURNING fleets once the first slice settles.
  fleet.travelTurns += 1;

  return res.status(200).json(buildOwnedActiveFleetsResponse(currentGalaxy, playerId));
});

app.post('/api/game/active-fleets', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CreateFleetMissionRequest | undefined;
  const missionType = normalizeFleetMissionType(body?.missionType);
  const origin = parseMissionCoordinates(body?.origin);
  const target = parseMissionCoordinates(body?.target);
  const ships = parseFleetShipSelections(body?.ships);
  const carriedBombs = parseFleetBombSelections(body?.carriedBombs);
  const cargo = parseResourcesPackPayload(body?.cargo);
  const useJumpGate = body?.useJumpGate === true;
  const bombardmentPriorities = parseBombardmentPriorities(body?.bombardmentPriorities);

  if (
    !missionType
    || !origin
    || !target
    || !ships
    || !carriedBombs
    || !cargo
    || (body?.bombardmentPriorities !== undefined
      && body?.bombardmentPriorities !== null
      && bombardmentPriorities === null)
    || (body?.useJumpGate !== undefined && typeof body.useJumpGate !== 'boolean')
  ) {
    return res.status(400).json({ error: 'Invalid fleet mission payload.' });
  }

  const result = createFleetMission(
    { galaxy: currentGalaxy, playerId },
    { missionType, origin, target, ships, carriedBombs, cargo, useJumpGate, bombardmentPriorities }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  const presentation = getPresentationData(currentGalaxy, playerId);
  const response: CreateFleetMissionResponse = {
    ownedPlanets: presentation.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet)),
    activeFleets: buildOwnedActiveFleetsResponse(currentGalaxy, playerId),
    mode: result.value.mode,
    message: result.value.message
  };
  return res.status(201).json(response);
});

app.post('/api/game/star-system-spy', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!canSessionAccessCurrentGame(currentGalaxy, auth.session)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CreateStarSystemSpyRequest | undefined;
  const systemCoordinates = parseStarSystemCoordinates(body?.systemCoordinates);
  const origin = parseMissionCoordinates(body?.origin);
  if (!systemCoordinates || !origin) {
    return res.status(400).json({ error: 'Invalid star system spy payload.' });
  }

  const result = createStarSystemSpyMissions(
    { galaxy: currentGalaxy, playerId },
    { systemX: systemCoordinates.x, systemY: systemCoordinates.y, origin }
  );
  if (!result.ok) {
    return sendGameCommandError(res, result.error);
  }

  const response: CreateStarSystemSpyResponse = {
    activeFleets: buildOwnedActiveFleetsResponse(currentGalaxy, playerId),
    launchedFleetCount: result.value.launchedFleetCount,
    message: `Launched ${result.value.launchedFleetCount} espionage probe${result.value.launchedFleetCount === 1 ? '' : 's'} across system ${systemCoordinates.x}:${systemCoordinates.y}.`
  };
  return res.status(201).json(response);
});

app.get('/api/health', (_req, res) => {
  return res.status(200).json({ status: 'ok' });
});

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  const server = app.listen(PORT, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : PORT;
    // eslint-disable-next-line no-console
    console.log(`SroGame server listening on http://localhost:${actualPort}`);
  });
}

function withApiMessage<T extends { message: string }>(
  body: T,
  messageKey: string,
  messageParams: ApiMessageParams | null = null
): T & { messageKey: string; messageParams: ApiMessageParams | null } {
  return {
    ...body,
    messageKey,
    messageParams
  };
}

function buildApiErrorBody(
  error: string,
  errorKey: string,
  errorParams: ApiMessageParams | null = null,
  extra: Record<string, unknown> = {}
): { error: string; errorKey: string; errorParams: ApiMessageParams | null } & Record<string, unknown> {
  return {
    ...extra,
    error,
    errorKey,
    errorParams
  };
}

function sendApiError(
  res: express.Response,
  status: number,
  error: string,
  errorKey: string,
  errorParams: ApiMessageParams | null = null,
  extra: Record<string, unknown> = {}
) {
  return res.status(status).json(buildApiErrorBody(error, errorKey, errorParams, extra));
}

type ApiRouteError = {
  status: number;
  error: string;
  errorKey: string;
  errorParams: ApiMessageParams | null;
};

function createApiRouteError(
  status: number,
  error: string,
  errorKey: string,
  errorParams: ApiMessageParams | null = null
): ApiRouteError {
  return {
    status,
    error,
    errorKey,
    errorParams
  };
}

function sendApiRouteError(res: express.Response, routeError: ApiRouteError) {
  return res.status(routeError.status).json(
    buildApiErrorBody(routeError.error, routeError.errorKey, routeError.errorParams)
  );
}

function pluralSuffix(value: number): string {
  return value === 1 ? '' : 's';
}

function buildRetryAfterMinutesParams(retryAfterMinutes: number): ApiMessageParams {
  return {
    retryAfterMinutes,
    minuteSuffix: pluralSuffix(retryAfterMinutes)
  };
}

function buildEndTurnMailBlockParams(unreadMailCount: number, pendingRequestCount: number): ApiMessageParams {
  return {
    pendingRequestCount,
    pendingRequestSuffix: pendingRequestCount === 1 ? '' : 's',
    unreadMailCount,
    unreadMailSuffix: unreadMailCount === 1 ? '' : 's',
    unreadMessageSuffix: unreadMailCount === 1 ? '' : 'es',
    mailJoinClause: pendingRequestCount > 0 && unreadMailCount > 0 ? ' and ' : ''
  };
}

function buildOnlineHumansRequiredMessageMetadata(gameId: string): {
  message: string | null;
  key: string | null;
  params: ApiMessageParams | null;
} {
  if (minimumOnlineHumansRequiredForGame(gameId) <= 1) {
    return {
      message: null,
      key: null,
      params: null
    };
  }

  return {
    message: 'At least 2 human players must be online to progress this multiplayer game.',
    key: 'api.gameplay.endTurn.notEnoughOnlineHumans',
    params: null
  };
}

function buildActiveHumanRequiredMessageMetadata(gameId: string): {
  message: string | null;
  key: string | null;
  params: ApiMessageParams | null;
} {
  if (minimumOnlineHumansRequiredForGame(gameId) <= 1) {
    return {
      message: null,
      key: null,
      params: null
    };
  }

  return {
    message: 'At least 1 active human player must be present to progress this multiplayer game.',
    key: 'api.gameplay.endTurn.activeHumanRequired',
    params: null
  };
}

type AuthAccount = {
  id: number;
  playerName: string;
  playerNameKey: string;
  email: string;
  emailKey: string;
  passwordHash: string;
  status: AccountStatus;
  localAdmin: boolean;
  createdAt: string;
  emailConfirmedAt: string | null;
  confirmationExpiresAt: string | null;
  lastConfirmationSentAt: string | null;
  lastPasswordResetRequestedAt: string | null;
  failedLoginAttempts: number;
  loginLockedUntil: string | null;
  replaceWithBotOnLogout: boolean;
  logoutBotProfileId: BotProfileId | null;
  language: 'en' | 'pl' | null;
  currentGameId: string | null;
  lastClosedGameId: string | null;
  lastClosedAt: string | null;
};

type AuthSession = {
  token: string;
  accountId: number;
  playerName: string;
  localAdmin: boolean;
  language: 'en' | 'pl' | null;
  createdAt: string;
  lastSeenAt: string;
  currentGameId: string | null;
  lastClosedGameId: string | null;
  lastClosedAt: string | null;
  pendingPresenceRemovedNoticeGameId: string | null;
};

type AuthData = {
  nextAccountId: number;
  accounts: AuthAccount[];
  sessions: AuthSession[];
};

function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < PLAYER_NAME_MIN || trimmed.length > PLAYER_NAME_MAX) {
    return null;
  }

  return trimmed;
}

function toPlayerNameKey(playerName: string): string {
  return playerName.trim().toLowerCase();
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) {
    return null;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(trimmed) ? trimmed : null;
}

function toEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePassword(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return null;
  }

  return value;
}

function normalizeAccountStatus(value: unknown, fallback: AccountStatus = 'ACTIVE'): AccountStatus {
  return value === 'PENDING_CONFIRMATION' || value === 'ACTIVE'
    ? value
    : fallback;
}

function normalizeLanguagePreference(value: unknown): 'en' | 'pl' | null {
  return value === 'en' || value === 'pl' ? value : null;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(expected, derived);
}

function loadAuthData(): AuthData {
  ensureAuthDirectory();

  try {
    const raw = fs.readFileSync(AUTH_DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AuthData;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid auth data');
    }

    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    for (const entry of accounts) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const account = entry as AuthAccount;
      if (typeof account.playerName === 'string') {
        account.playerNameKey = toPlayerNameKey(account.playerName);
      }
      const createdAtMs = Date.parse(account.createdAt);
      const normalizedCreatedAt = Number.isFinite(createdAtMs)
        ? new Date(createdAtMs).toISOString()
        : new Date().toISOString();
      const normalizedCreatedAtMs = Number.isFinite(createdAtMs)
        ? createdAtMs
        : Date.parse(normalizedCreatedAt);
      account.createdAt = normalizedCreatedAt;
      account.email = typeof account.email === 'string' ? account.email.trim() : '';
      account.emailKey = account.email ? toEmailKey(account.email) : '';
      account.status = normalizeAccountStatus(account.status, 'ACTIVE');
      account.localAdmin = account.localAdmin === true;
      account.emailConfirmedAt = typeof account.emailConfirmedAt === 'string' && account.emailConfirmedAt.trim()
        ? account.emailConfirmedAt
        : account.status === 'ACTIVE' && account.email
          ? normalizedCreatedAt
          : null;
      account.confirmationExpiresAt = typeof account.confirmationExpiresAt === 'string' && account.confirmationExpiresAt.trim()
        ? account.confirmationExpiresAt
        : account.status === 'PENDING_CONFIRMATION'
          ? new Date(normalizedCreatedAtMs + PENDING_CONFIRMATION_LIFETIME_MS).toISOString()
          : null;
      account.lastConfirmationSentAt = typeof account.lastConfirmationSentAt === 'string' && account.lastConfirmationSentAt.trim()
        ? account.lastConfirmationSentAt
        : account.status === 'PENDING_CONFIRMATION'
          ? normalizedCreatedAt
          : null;
      account.lastPasswordResetRequestedAt = typeof account.lastPasswordResetRequestedAt === 'string'
        && account.lastPasswordResetRequestedAt.trim()
        ? account.lastPasswordResetRequestedAt
        : null;
      account.failedLoginAttempts = Number.isInteger(account.failedLoginAttempts)
        ? Math.max(0, account.failedLoginAttempts)
        : 0;
      account.loginLockedUntil = typeof account.loginLockedUntil === 'string' && account.loginLockedUntil.trim()
        ? account.loginLockedUntil
        : null;
      clearExpiredLoginLock(account);
      account.replaceWithBotOnLogout = account.replaceWithBotOnLogout === true;
      account.logoutBotProfileId = normalizeBotProfileId(account.logoutBotProfileId);
      account.language = normalizeLanguagePreference(account.language);
      account.currentGameId = typeof account.currentGameId === 'string' && account.currentGameId.trim()
        ? account.currentGameId
        : null;
      account.lastClosedGameId = typeof account.lastClosedGameId === 'string' && account.lastClosedGameId.trim()
        ? account.lastClosedGameId
        : null;
      account.lastClosedAt = typeof account.lastClosedAt === 'string' && account.lastClosedAt.trim()
        ? account.lastClosedAt
        : null;
    }

    for (const entry of sessions) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const session = entry as AuthSession;
      session.language = normalizeLanguagePreference(session.language);
      session.currentGameId = typeof session.currentGameId === 'string' && session.currentGameId.trim()
        ? session.currentGameId
        : null;
      session.lastClosedGameId = typeof session.lastClosedGameId === 'string' && session.lastClosedGameId.trim()
        ? session.lastClosedGameId
        : null;
      session.lastClosedAt = typeof session.lastClosedAt === 'string' && session.lastClosedAt.trim()
        ? session.lastClosedAt
        : null;
      session.pendingPresenceRemovedNoticeGameId =
        typeof session.pendingPresenceRemovedNoticeGameId === 'string' && session.pendingPresenceRemovedNoticeGameId.trim()
          ? session.pendingPresenceRemovedNoticeGameId
          : null;
    }

    return {
      nextAccountId: Number.isInteger(parsed.nextAccountId) ? parsed.nextAccountId : 1,
      accounts,
      sessions
    };
  } catch {
    const fallback: AuthData = { nextAccountId: 1, accounts: [], sessions: [] };
    saveAuthData(fallback);
    return fallback;
  }
}

function saveAuthData(data: AuthData): void {
  ensureAuthDirectory();
  fs.writeFileSync(AUTH_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function setAccountCurrentGameId(data: AuthData, accountId: number, currentGameId: string | null): void {
  const normalizedCurrentGameId = typeof currentGameId === 'string' && currentGameId.trim()
    ? currentGameId
    : null;
  const account = data.accounts.find((entry) => entry.id === accountId);
  if (account) {
    account.currentGameId = normalizedCurrentGameId;
  }

  for (const session of data.sessions) {
    if (session.accountId === accountId) {
      session.currentGameId = normalizedCurrentGameId;
      if (session.pendingPresenceRemovedNoticeGameId && session.pendingPresenceRemovedNoticeGameId !== normalizedCurrentGameId) {
        session.pendingPresenceRemovedNoticeGameId = null;
      }
    }
  }
}

function setAccountLanguagePreference(
  data: AuthData,
  accountId: number,
  language: 'en' | 'pl' | null
): void {
  const normalizedLanguage = normalizeLanguagePreference(language);
  const account = data.accounts.find((entry) => entry.id === accountId);
  if (account) {
    account.language = normalizedLanguage;
  }

  for (const session of data.sessions) {
    if (session.accountId === accountId) {
      session.language = normalizedLanguage;
    }
  }
}

function setLastClosedGameInfo(data: AuthData, accountId: number, gameId: string | null, timestamp: string | null): void {
  const normalizedGameId = typeof gameId === 'string' && gameId.trim()
    ? gameId
    : null;
  const normalizedTimestamp = typeof timestamp === 'string' && timestamp.trim()
    ? timestamp
    : null;

  const account = data.accounts.find((entry) => entry.id === accountId);
  if (account) {
    account.lastClosedGameId = normalizedGameId;
    account.lastClosedAt = normalizedTimestamp;
  }

  for (const session of data.sessions) {
    if (session.accountId !== accountId) {
      continue;
    }
    session.lastClosedGameId = normalizedGameId;
    session.lastClosedAt = normalizedTimestamp;
  }
}

function setPresenceRemovedNoticeForAccount(data: AuthData, accountId: number, gameId: string): boolean {
  let changed = false;
  for (const session of data.sessions) {
    if (session.accountId !== accountId) {
      continue;
    }
    if (session.pendingPresenceRemovedNoticeGameId === gameId) {
      continue;
    }
    session.pendingPresenceRemovedNoticeGameId = gameId;
    changed = true;
  }
  return changed;
}

function clearPresenceRemovedNoticeForAccount(data: AuthData, accountId: number, gameId: string): boolean {
  let changed = false;
  for (const session of data.sessions) {
    if (session.accountId !== accountId || session.pendingPresenceRemovedNoticeGameId !== gameId) {
      continue;
    }
    session.pendingPresenceRemovedNoticeGameId = null;
    changed = true;
  }
  return changed;
}

function ensureAuthDirectory(): void {
  const dir = path.dirname(AUTH_DATA_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

function saveCurrentGameSnapshot(): void {
  if (!currentGalaxy || currentGameOwnerId === null || !currentGameSetup || !currentRuntimeGameId) {
    throw new Error('No active game snapshot available.');
  }

  const summary = writeRotatingAutoSave(
    GAME_SAVES_DIRECTORY_PATH,
    currentGalaxy,
    currentGameOwnerId,
    currentGameSetup,
    {
      rotationLimit: AUTO_SAVE_ROTATION_LIMIT,
      maxSaveFiles: MAX_GAME_SAVE_FILES,
      gameId: currentRuntimeGameId
    }
  );

  updateGameRecord(GAME_REGISTRY_DATA_PATH, currentRuntimeGameId, {
    currentTurn: currentGalaxy.currentTurn,
    currentSaveId: summary.saveId,
    lastSavedAt: summary.savedAt,
    updatedAt: summary.savedAt
  });
}

function saveRuntimeSnapshot(
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>,
  ownerAccountId: number
): void {
  const summary = writeRotatingAutoSave(
    GAME_SAVES_DIRECTORY_PATH,
    runtime.galaxy,
    ownerAccountId,
    runtime.setup,
    {
      rotationLimit: AUTO_SAVE_ROTATION_LIMIT,
      maxSaveFiles: MAX_GAME_SAVE_FILES,
      gameId
    }
  );

  updateGameRecord(GAME_REGISTRY_DATA_PATH, gameId, {
    currentTurn: runtime.galaxy.currentTurn,
    currentSaveId: summary.saveId,
    lastSavedAt: summary.savedAt,
    updatedAt: summary.savedAt
  });
}

function isRunningMultiplayerGame(gameId: string): boolean {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  return record?.kind === 'MULTIPLAYER' && record.status === 'RUNNING';
}

function buildMultiplayerPresenceSummary(
  authData: AuthData,
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>
): {
  presentHumanCount: number;
  activeHumanCount: number;
  blockingPlayerIds: Set<number>;
} {
  if (!isRunningMultiplayerGame(gameId)) {
    const blockingPlayerIds = new Set(
      activeHumanPlayers(runtime.galaxy).map((player) => player.playerId)
    );
    return {
      presentHumanCount: blockingPlayerIds.size,
      activeHumanCount: blockingPlayerIds.size,
      blockingPlayerIds
    };
  }

  const memberships = listMembershipsForGame(GAME_MEMBERSHIPS_DATA_PATH, gameId)
    .filter((entry) => entry.isActive);
  const sessionByAccountId = new Map(
    authData.sessions
      .filter((session) => session.currentGameId === gameId)
      .map((session) => [session.accountId, session] as const)
  );
  let presentHumanCount = 0;
  let activeHumanCount = 0;
  const blockingPlayerIds = new Set<number>();

  for (const membership of memberships) {
    if (!sessionByAccountId.has(membership.accountId)) {
      continue;
    }

    const playerId = runtime.galaxy.playerNameMap.get(membership.playerName);
    if (typeof playerId !== 'number') {
      continue;
    }

    const presence = getPresenceForGameAccount(MULTIPLAYER_PRESENCE_DATA_PATH, gameId, membership.accountId);
    const derivedState = presence?.state;
    if (derivedState !== 'ACTIVE' && derivedState !== 'AUTO_SKIP_TURN') {
      continue;
    }

    presentHumanCount += 1;
    if (derivedState === 'ACTIVE') {
      activeHumanCount += 1;
      blockingPlayerIds.add(playerId);
    }
  }

  return {
    presentHumanCount,
    activeHumanCount,
    blockingPlayerIds
  };
}

function reconcileTimedOutMultiplayerPresence(
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>,
  authData: AuthData,
  nowMs = Date.now()
): boolean {
  if (!isRunningMultiplayerGame(gameId)) {
    return false;
  }

  const membershipsByAccountId = new Map(
    listMembershipsForGame(GAME_MEMBERSHIPS_DATA_PATH, gameId)
      .filter((membership) => membership.isActive)
      .map((membership) => [membership.accountId, membership] as const)
  );
  const timedOutPresences = listPresenceForGame(MULTIPLAYER_PRESENCE_DATA_PATH, gameId)
    .filter((presence) => {
      const lastSeenMs = Date.parse(presence.lastSeenAt);
      return Number.isNaN(lastSeenMs) || nowMs - lastSeenMs >= MULTIPLAYER_PRESENCE_TIMEOUT_MS;
    });

  if (timedOutPresences.length === 0) {
    return false;
  }

  const nextReadyPlayerIds = new Set(runtime.currentTurnReadyPlayerIds);
  let changed = false;
  let authChanged = false;
  for (const presence of timedOutPresences) {
    if (!removePresence(MULTIPLAYER_PRESENCE_DATA_PATH, gameId, presence.accountId)) {
      continue;
    }

    changed = true;
    authChanged = setPresenceRemovedNoticeForAccount(authData, presence.accountId, gameId) || authChanged;
    const membership = membershipsByAccountId.get(presence.accountId);
    const playerId = membership
      ? runtime.galaxy.playerNameMap.get(membership.playerName) ?? null
      : null;
    if (playerId !== null) {
      nextReadyPlayerIds.delete(playerId);
    }
  }

  if (!changed) {
    return false;
  }

  updateGameRuntime(gameId, {
    currentTurnReadyPlayerIds: nextReadyPlayerIds
  });
  if (currentRuntimeGameId === gameId) {
    currentTurnReadyPlayerIds = nextReadyPlayerIds;
  }
  if (authChanged) {
    saveAuthData(authData);
  }
  return true;
}

function reconcileEmptyPresenceUnloadState(
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>,
  record: NonNullable<ReturnType<typeof getGameById>>,
  presentHumanCount: number,
  nowMs = Date.now()
): boolean {
  if (presentHumanCount > 0) {
    if (runtime.emptyPresenceUnloadAt) {
      updateGameRuntime(gameId, { emptyPresenceUnloadAt: null });
    }
    return false;
  }

  if (!runtime.emptyPresenceUnloadAt) {
    updateGameRuntime(gameId, {
      emptyPresenceUnloadAt: new Date(nowMs + MULTIPLAYER_EMPTY_RUNTIME_UNLOAD_MS).toISOString()
    });
    return false;
  }

  const unloadAtMs = Date.parse(runtime.emptyPresenceUnloadAt);
  if (Number.isNaN(unloadAtMs) || unloadAtMs > nowMs) {
    return false;
  }

  saveAndUnloadRunningMultiplayerGame(gameId, runtime, record, 'NO_PRESENT_HUMANS');
  return true;
}

function reconcileRunningMultiplayerLifecycle(
  gameId: string,
  authData: AuthData,
  nowMs = Date.now()
): { unloaded: boolean } {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  const runtime = getGameRuntime(gameId);
  if (!record || !runtime || record.kind !== 'MULTIPLAYER' || record.status !== 'RUNNING') {
    return { unloaded: false };
  }

  reconcileTimedOutMultiplayerPresence(gameId, runtime, authData, nowMs);
  const runtimeAfterTimeout = getGameRuntime(gameId);
  if (!runtimeAfterTimeout) {
    return { unloaded: true };
  }

  reconcileOfflineBotControlledSeatsForRuntime(gameId, runtimeAfterTimeout, authData);
  const runtimeAfterBotControl = getGameRuntime(gameId);
  if (!runtimeAfterBotControl) {
    return { unloaded: true };
  }

  const presenceSummary = buildMultiplayerPresenceSummary(authData, gameId, runtimeAfterBotControl);
  const unloaded = reconcileEmptyPresenceUnloadState(gameId, runtimeAfterBotControl, record, presenceSummary.presentHumanCount, nowMs);
  return { unloaded };
}

function reconcileLoadedRunningMultiplayerGames(authData: AuthData, nowMs = Date.now()): void {
  for (const gameId of listLoadedGameIds()) {
    reconcileRunningMultiplayerLifecycle(gameId, authData, nowMs);
  }
}

function buildCurrentPlayerPresenceOptions(gameId: string, session: AuthSession): {
  currentPlayerPresenceState: TurnStatusResponse['currentPlayerPresenceState'];
  currentPlayerAutoSkipEnabled: boolean;
  currentPlayerAutoSkipActivatedAt: string | null;
  showAutoSkipReturnNotice: boolean;
  showPresenceRemovedReturnNotice: boolean;
} {
  if (!isRunningMultiplayerGame(gameId)) {
    return {
      currentPlayerPresenceState: null,
      currentPlayerAutoSkipEnabled: false,
      currentPlayerAutoSkipActivatedAt: null,
      showAutoSkipReturnNotice: false,
      showPresenceRemovedReturnNotice: false
    };
  }

  const presence = getPresenceForGameAccount(MULTIPLAYER_PRESENCE_DATA_PATH, gameId, session.accountId);
  if (!presence) {
    return {
      currentPlayerPresenceState: null,
      currentPlayerAutoSkipEnabled: false,
      currentPlayerAutoSkipActivatedAt: null,
      showAutoSkipReturnNotice: false,
      showPresenceRemovedReturnNotice: session.pendingPresenceRemovedNoticeGameId === gameId
    };
  }

  return {
    currentPlayerPresenceState: presence.state,
    currentPlayerAutoSkipEnabled: presence.autoSkipTurnEnabled,
    currentPlayerAutoSkipActivatedAt: presence.autoSkipTurnActivatedAt,
    showAutoSkipReturnNotice: presence.returnNoticePending,
    showPresenceRemovedReturnNotice: session.pendingPresenceRemovedNoticeGameId === gameId
  };
}

function minimumOnlineHumansRequiredForGame(gameId: string): number {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  return record?.kind === 'MULTIPLAYER' && record.status === 'RUNNING' ? 2 : 1;
}

function buildOnlineHumansRequiredMessage(gameId: string): string | null {
  return buildOnlineHumansRequiredMessageMetadata(gameId).message;
}

function buildActiveHumanRequiredMessage(gameId: string): string | null {
  return buildActiveHumanRequiredMessageMetadata(gameId).message;
}

function reconcileReadyStateForOnlineHumans(
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>,
  authData: AuthData
): {
  presentHumanCount: number;
  activeHumanCount: number;
  blockingPlayerIds: Set<number>;
} {
  const presenceSummary = buildMultiplayerPresenceSummary(authData, gameId, runtime);
  const minimumOnlineHumansRequired = minimumOnlineHumansRequiredForGame(gameId);
  if (
    minimumOnlineHumansRequired <= 1
    || (presenceSummary.presentHumanCount >= minimumOnlineHumansRequired && presenceSummary.activeHumanCount >= 1)
  ) {
    return presenceSummary;
  }

  if (runtime.currentTurnReadyPlayerIds.size === 0) {
    return presenceSummary;
  }

  runtime.currentTurnReadyPlayerIds.clear();
  updateGameRuntime(gameId, {
    currentTurnReadyPlayerIds: new Set<number>()
  });
  if (currentRuntimeGameId === gameId) {
    currentTurnReadyPlayerIds.clear();
  }
  return presenceSummary;
}

function buildGameTurnStatusResponse(
  access: {
    gameId: string;
    galaxy: Galaxy;
    auth: { data: AuthData; session: AuthSession };
    playerId: number;
    readyPlayerIds: ReadonlySet<number>;
    isProcessing: boolean;
    runtime: NonNullable<ReturnType<typeof getGameRuntime>>;
  }
): TurnStatusResponse {
  const presenceSummary = reconcileReadyStateForOnlineHumans(access.gameId, access.runtime, access.auth.data);
  const readyPlayerIds = currentRuntimeGameId === access.gameId
    ? currentTurnReadyPlayerIds
    : access.runtime.currentTurnReadyPlayerIds;
  const isProcessing = currentRuntimeGameId === access.gameId
    ? isTurnProcessing
    : access.isProcessing;
  const minimumOnlineHumansRequired = minimumOnlineHumansRequiredForGame(access.gameId);
  const progressionBlockedReason = presenceSummary.presentHumanCount < minimumOnlineHumansRequired
    ? buildOnlineHumansRequiredMessageMetadata(access.gameId)
    : presenceSummary.activeHumanCount < 1
      ? buildActiveHumanRequiredMessageMetadata(access.gameId)
      : { message: null, key: null, params: null };
  return buildTurnStatusResponse(
    access.galaxy,
    readyPlayerIds,
    access.playerId,
    isProcessing,
    {
      onlineHumanCount: presenceSummary.presentHumanCount,
      minimumOnlineHumanCount: minimumOnlineHumansRequired,
      progressionBlockedReason: progressionBlockedReason.message,
      progressionBlockedReasonKey: progressionBlockedReason.key,
      progressionBlockedReasonParams: progressionBlockedReason.params,
      blockingPlayerIds: presenceSummary.blockingPlayerIds,
      ...buildCurrentPlayerPresenceOptions(access.gameId, access.auth.session)
    }
  );
}

function saveAndUnloadRunningMultiplayerGame(
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>,
  record: NonNullable<ReturnType<typeof getGameById>>,
  inactiveReason: 'NO_PRESENT_HUMANS' | 'LEFT_WITH_TOO_FEW_ONLINE_PLAYERS'
): void {
  const ownerAccountId = record.ownerAccountId ?? record.hostAccountId;
  if (ownerAccountId !== null) {
    saveRuntimeSnapshot(gameId, runtime, ownerAccountId);
  }

  deleteGameRuntime(gameId);
  removePresenceForGame(MULTIPLAYER_PRESENCE_DATA_PATH, gameId);
  moveMountedRuntimeAwayFromGame(gameId);

  updateGameRecord(GAME_REGISTRY_DATA_PATH, gameId, {
    inactiveReason,
    updatedAt: new Date().toISOString()
  });
}

function registerRunningGame(
  authData: AuthData,
  kind: GameKind,
  galaxy: Galaxy,
  options: {
    gameId?: string;
    ownerAccountId: number | null;
    ownerPlayerName: string | null;
    hostAccountId: number | null;
    hostPlayerName: string | null;
    currentSaveId?: string | null;
    lastSavedAt?: string | null;
    currentGameAccountIds: number[];
    memberships: Array<{
      accountId: number;
      playerName: string;
      role: 'OWNER' | 'HOST' | 'MEMBER';
    }>;
  }
): string {
  const now = new Date().toISOString();
  const existingRecord = options.gameId ? getGameById(GAME_REGISTRY_DATA_PATH, options.gameId) : null;
  const record = createGameRecord({
    gameId: options.gameId,
    kind,
    status: 'RUNNING',
    name: galaxy.name,
    inactiveReason: null,
    ownerAccountId: options.ownerAccountId,
    ownerPlayerName: options.ownerPlayerName,
    hostAccountId: options.hostAccountId,
    hostPlayerName: options.hostPlayerName,
    currentTurn: galaxy.currentTurn,
    currentSaveId: options.currentSaveId ?? null,
    lastStartedAt: now,
    lastSavedAt: options.lastSavedAt ?? null,
    createdAt: existingRecord?.createdAt ?? now,
    updatedAt: now
  });

  upsertGameRecord(GAME_REGISTRY_DATA_PATH, record);

  for (const membership of options.memberships) {
    upsertMembership(GAME_MEMBERSHIPS_DATA_PATH, {
      gameId: record.gameId,
      accountId: membership.accountId,
      playerName: membership.playerName,
      role: membership.role,
      joinedAt: now,
      lastSeenAt: now,
      isActive: true
    });
  }

  for (const accountId of options.currentGameAccountIds) {
    setAccountCurrentGameId(authData, accountId, record.gameId);
  }

  saveAuthData(authData);
  currentRuntimeGameId = record.gameId;
  persistCurrentRuntimeStoreState();
  return record.gameId;
}

function updateCurrentRuntimeGameRegistryRecord(): void {
  if (!currentRuntimeGameId || !currentGalaxy) {
    return;
  }

  updateGameRecord(GAME_REGISTRY_DATA_PATH, currentRuntimeGameId, {
    status: 'RUNNING',
    inactiveReason: null,
    name: currentGalaxy.name,
    currentTurn: currentGalaxy.currentTurn,
    updatedAt: new Date().toISOString()
  });
}

function persistCurrentRuntimeStoreState(): void {
  if (!currentRuntimeGameId || !currentGalaxy || !currentGameSetup) {
    return;
  }

  const existingRuntime = getGameRuntime(currentRuntimeGameId);
  if (!existingRuntime) {
    const now = new Date().toISOString();
    setGameRuntime({
      gameId: currentRuntimeGameId,
      galaxy: currentGalaxy,
      setup: currentGameSetup,
      presentationByPlayer: currentGalaxyPresentationByPlayer,
      loadedAt: now,
      lastTouchedAt: now,
      isDirty: false,
      currentTurnReadyPlayerIds: new Set(currentTurnReadyPlayerIds),
      isTurnProcessing,
      offlineBotControlledPlayerIds: new Set<number>(),
      emptyPresenceUnloadAt: null
    });
    return;
  }

  updateGameRuntime(currentRuntimeGameId, {
    galaxy: currentGalaxy,
    setup: currentGameSetup,
    presentationByPlayer: currentGalaxyPresentationByPlayer,
    currentTurnReadyPlayerIds: new Set(currentTurnReadyPlayerIds),
    offlineBotControlledPlayerIds: new Set(existingRuntime.offlineBotControlledPlayerIds),
    emptyPresenceUnloadAt: existingRuntime.emptyPresenceUnloadAt,
    isTurnProcessing,
    isDirty: false
  });
}

function switchCurrentRuntime(gameId: string): boolean {
  if (currentRuntimeGameId && currentRuntimeGameId !== gameId) {
    persistCurrentRuntimeStoreState();
  }

  const runtime = getGameRuntime(gameId);
  if (!runtime) {
    return false;
  }

  currentRuntimeGameId = runtime.gameId;
  currentGalaxy = runtime.galaxy;
  currentGameSetup = runtime.setup;
  currentGalaxyPresentationByPlayer = runtime.presentationByPlayer;
  currentTurnReadyPlayerIds = new Set(runtime.currentTurnReadyPlayerIds);
  isTurnProcessing = runtime.isTurnProcessing;
  currentGameOwnerId = null;
  currentGameOwnerPlayerName = null;

  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  if (record) {
    currentGameOwnerId = record.ownerAccountId;
    currentGameOwnerPlayerName = record.ownerPlayerName;
  }

  return true;
}

function buildActiveGameSummary() {
  if (!currentGalaxy) {
    return null;
  }

  return {
    ownerAccountId: currentGameOwnerId,
    ownerPlayerName: currentGameOwnerPlayerName,
    galaxyName: currentGalaxy.name,
    currentTurn: currentGalaxy.currentTurn
  };
}

function buildGameListResponse(session: AuthSession | null): GameListResponse {
  const records = listGames(GAME_REGISTRY_DATA_PATH);
  const visibleRecords = session?.localAdmin === true
    ? records
    : records.filter((record) => session ? canSessionViewGameRecord(record.gameId, session) : false);

  return {
    games: visibleRecords.map((record) => buildGameSummary(record, session)),
    currentGameId: session?.currentGameId ?? null,
    isLoggedIn: !!session,
    currentAccountId: session?.accountId ?? null,
    currentPlayerName: session?.playerName ?? null,
    currentPlayerIsLocalAdmin: session?.localAdmin === true
  };
}

function buildCurrentGameStatusResponse(session: AuthSession): CurrentGameStatusResponse {
  if (!session.currentGameId) {
    return {
      currentGameId: null,
      game: null,
      canResume: false,
      unavailableReason: null,
      unavailableReasonKey: null,
      unavailableReasonParams: null
    };
  }

  const record = getGameById(GAME_REGISTRY_DATA_PATH, session.currentGameId);
  if (!record || !canSessionViewGameRecord(session.currentGameId, session)) {
    return {
      currentGameId: null,
      game: null,
      canResume: false,
      unavailableReason: null,
      unavailableReasonKey: null,
      unavailableReasonParams: null
    };
  }

  const summary = buildGameSummary(record, session);
  return {
    currentGameId: session.currentGameId,
    game: summary,
    canResume: summary.canResume,
    unavailableReason: summary.canResume
      ? null
      : record.status === 'RUNNING'
        ? 'You do not currently have access to resume this game.'
        : 'This game is not currently active. Ask localAdmin to resume it.',
    unavailableReasonKey: summary.canResume
      ? null
      : record.status === 'RUNNING'
        ? 'api.games.current.unavailableResume'
        : 'api.games.current.inactiveAskAdmin',
    unavailableReasonParams: null
  };
}

function buildAccountSettingsResponse(account: AuthAccount): AccountSettingsResponse {
  const currentGameRecord = account.currentGameId
    ? getGameById(GAME_REGISTRY_DATA_PATH, account.currentGameId)
    : null;

  return {
    playerName: account.playerName,
    email: account.email,
    accountStatus: account.status,
    emailConfirmed: account.emailConfirmedAt !== null && account.status === 'ACTIVE',
    emailConfirmedAt: account.emailConfirmedAt,
    accountCreatedAt: account.createdAt,
    localAdmin: account.localAdmin === true,
    currentGameId: account.currentGameId,
    currentGameName: currentGameRecord?.name ?? null,
    replaceWithBotOnLogout: account.replaceWithBotOnLogout === true,
    logoutBotProfileId: account.logoutBotProfileId,
    language: account.language,
    forgotPasswordEnabled: false,
    forgotPasswordAvailableAt: account.lastPasswordResetRequestedAt,
    forgotPasswordInfo: 'Password reset by email is not available yet.',
    forgotPasswordInfoKey: 'api.account.settings.forgotPasswordUnavailable',
    forgotPasswordInfoParams: null
  };
}

function buildGameSummary(record: ReturnType<typeof listGames>[number], session: AuthSession | null): GameSummary {
  const canView = !!session && canSessionViewGameRecord(record.gameId, session);
  const isCurrentGame = session?.currentGameId === record.gameId;
  const isLoaded = hasGameRuntime(record.gameId);
  const canResume = canView
    && isCurrentGame
    && record.status === 'RUNNING'
    && (
      isLoaded
      || canResumeSingleplayerGameRecord(record)
    );
  return {
    gameId: record.gameId,
    kind: record.kind,
    status: record.status,
    name: record.name,
    ownerAccountId: record.ownerAccountId,
    ownerPlayerName: record.ownerPlayerName,
    hostAccountId: record.hostAccountId,
    hostPlayerName: record.hostPlayerName,
    currentTurn: record.currentTurn,
    updatedAt: record.updatedAt,
    isCurrentGame,
    isLoaded,
    canResume,
    canJoin: canView && record.status === 'RUNNING',
    canManage: session?.localAdmin === true
  };
}

function canResumeSingleplayerGameRecord(record: ReturnType<typeof listGames>[number]): boolean {
  return record.kind === 'SINGLEPLAYER'
    && typeof record.currentSaveId === 'string'
    && record.currentSaveId.trim().length > 0;
}

function loadSingleplayerGameRecord(
  authData: AuthData,
  session: AuthSession,
  record: ReturnType<typeof getGameById>
): { ok: true } | { ok: false; status: number; error: string; errorKey: string } {
  if (!record || record.kind !== 'SINGLEPLAYER') {
    return {
      ok: false,
      status: 404,
      error: 'Game not found.',
      errorKey: 'api.errors.gameNotFound'
    };
  }

  const saveId = typeof record.currentSaveId === 'string' ? record.currentSaveId.trim() : '';
  if (!saveId) {
    return {
      ok: false,
      status: 404,
      error: 'No save is available for this game.',
      errorKey: 'api.games.current.noSaveAvailable'
    };
  }

  const save = readGameSaveById(GAME_SAVES_DIRECTORY_PATH, saveId);
  if (!save) {
    return {
      ok: false,
      status: 404,
      error: 'Saved game not found.',
      errorKey: 'api.games.current.savedGameNotFound'
    };
  }

  const loadAccess = resolveGameSaveLoadAccess(save, session.accountId, session.localAdmin === true);
  if (!loadAccess.canLoad) {
    return {
      ok: false,
      status: 403,
      error: loadAccess.canLoadReason ?? 'Forbidden.',
      errorKey: 'api.errors.forbidden'
    };
  }

  const hydrated = hydrateGameSave(save);
  currentGalaxy = hydrated.galaxy;
  currentGameOwnerId = session.accountId;
  currentGameOwnerPlayerName = session.playerName;
  currentGameSetup = hydrated.setup;
  currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);
  resetActiveTurnState();
  clearBotDecisionTracesV2();
  resetBotAdminRuntimeState();
  registerRunningGame(authData, 'SINGLEPLAYER', currentGalaxy, {
    gameId: save.gameId ?? record.gameId,
    ownerAccountId: session.accountId,
    ownerPlayerName: session.playerName,
    hostAccountId: session.accountId,
    hostPlayerName: session.playerName,
    currentSaveId: saveId,
    lastSavedAt: save.savedAt,
    currentGameAccountIds: [session.accountId],
    memberships: [{
      accountId: session.accountId,
      playerName: session.playerName,
      role: 'OWNER'
    }]
  });

  return { ok: true };
}

function buildMultiplayerGameBrowserResponse(session: AuthSession | null): MultiplayerGameBrowserResponse {
  const nowMs = Date.now();
  const multiplayerRecords = listGames(GAME_REGISTRY_DATA_PATH)
    .filter((record) => record.kind === 'MULTIPLAYER')
    .filter((record) => canSessionViewMultiplayerBrowserRecord(record, session));
  const activeDraftLobbies = multiplayerRecords
    .filter((record) => isActiveDraftLobbyForBrowser(record, nowMs))
    .map((record) => buildMultiplayerGameListItem(record, session));
  const activeRunningGames = multiplayerRecords
    .filter((record) => isActiveRunningMultiplayerGameForBrowser(record))
    .map((record) => buildMultiplayerGameListItem(record, session));
  const otherMultiplayerGames = multiplayerRecords
    .filter((record) => !isActiveDraftLobbyForBrowser(record, nowMs) && !isActiveRunningMultiplayerGameForBrowser(record))
    .map((record) => buildMultiplayerGameListItem(record, session));
  const selectedRecord = session?.currentGameId
    ? multiplayerRecords.find((record) => record.gameId === session.currentGameId) ?? null
    : null;

  return {
    activeDraftLobbies,
    activeRunningGames,
    otherMultiplayerGames,
    selectedGameId: selectedRecord?.gameId ?? null,
    isLoggedIn: !!session,
    currentAccountId: session?.accountId ?? null,
    currentPlayerName: session?.playerName ?? null,
    currentPlayerIsLocalAdmin: session?.localAdmin === true
  };
}

function buildMultiplayerGameDetailResponse(
  gameId: string,
  session: AuthSession | null
): MultiplayerGameDetailResponse | null {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  if (!record || record.kind !== 'MULTIPLAYER') {
    return null;
  }

  const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, gameId);
  const canViewRunning = !!session && (session.localAdmin === true || canSessionViewGameRecord(record.gameId, session));
  if (record.status !== 'DRAFT' && !lobby && !canViewRunning) {
    return null;
  }

  const runtime = getGameRuntime(gameId);
  return {
    game: buildGameSummary(record, session),
    lobby: lobby
      ? buildMultiplayerLobbyDto(
        lobby,
        session?.accountId ?? null,
        session?.localAdmin === true
      )
      : null,
    runningMembers: record.status === 'RUNNING'
      ? buildRunningMultiplayerMembers(record.gameId, runtime)
      : []
  };
}

function buildMultiplayerGameListItem(
  record: ReturnType<typeof listGames>[number],
  session: AuthSession | null
): MultiplayerGameBrowserResponse['activeDraftLobbies'][number] {
  const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, record.gameId);
  const membershipCount = lobby
    ? (lobby?.members.length ?? 0)
    : listMembershipsForGame(GAME_MEMBERSHIPS_DATA_PATH, record.gameId)
      .filter((entry) => entry.isActive)
      .length;
  const isMember = !!session && (
    lobby
      ? lobby.members.some((member) => member.accountId === session.accountId)
      : isAccountMemberOfGame(GAME_MEMBERSHIPS_DATA_PATH, record.gameId, session.accountId)
  );
  const runtime = record.status === 'RUNNING'
    ? getGameRuntime(record.gameId)
    : null;
  const canEnter = record.status === 'RUNNING' && !lobby && !!session && canSessionViewGameRecord(record.gameId, session);
  return {
    gameId: record.gameId,
    name: record.name,
    status: record.status,
    statusLabel: buildMultiplayerGameStatusLabel(record),
    isResumeLobby: lobby?.isResumeLobby === true,
    inactiveReasonText: buildMultiplayerInactiveReasonText(record),
    hostAccountId: record.hostAccountId,
    hostPlayerName: record.hostPlayerName,
    memberCount: membershipCount,
    offlineBotControlledCount: runtime?.offlineBotControlledPlayerIds.size ?? 0,
    isMember,
    isCurrentGame: session?.currentGameId === record.gameId,
    canJoin: !!lobby && !!session && !isMember,
    canEnter,
    canReturnToGame: canEnter && isMember && session?.currentGameId !== record.gameId,
    canResumeLobby: record.status === 'RUNNING' && !runtime && !lobby && session?.localAdmin === true,
    canManage: session?.localAdmin === true && (!lobby || lobby.hostAccountId === session.accountId),
    canArchive: record.status === 'RUNNING' && !runtime && !lobby && session?.localAdmin === true,
    updatedAt: record.updatedAt
  };
}

function canSessionViewMultiplayerBrowserRecord(
  record: ReturnType<typeof listGames>[number],
  session: AuthSession | null
): boolean {
  if (getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, record.gameId)) {
    return true;
  }

  return session?.localAdmin === true || (session ? canSessionViewGameRecord(record.gameId, session) : false);
}

function isActiveDraftLobbyForBrowser(record: ReturnType<typeof listGames>[number], nowMs: number): boolean {
  const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, record.gameId);
  if (!lobby) {
    return false;
  }
  if (lobby.isResumeLobby) {
    return record.status === 'RUNNING' && !hasGameRuntime(record.gameId);
  }
  if (record.status !== 'DRAFT') {
    return false;
  }

  const updatedAtMs = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return false;
  }

  return nowMs - updatedAtMs <= ACTIVE_MULTIPLAYER_DRAFT_WINDOW_MS;
}

function isActiveRunningMultiplayerGameForBrowser(record: ReturnType<typeof listGames>[number]): boolean {
  return record.status === 'RUNNING'
    && hasGameRuntime(record.gameId)
    && !getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, record.gameId);
}

function buildMultiplayerGameStatusLabel(record: ReturnType<typeof listGames>[number]): string {
  const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, record.gameId);
  if (lobby?.isResumeLobby) {
    return 'Resumed lobby';
  }
  if (record.status === 'RUNNING' && !hasGameRuntime(record.gameId)) {
    return 'Saved / Inactive';
  }

  return record.status;
}

function buildMultiplayerInactiveReasonText(record: ReturnType<typeof listGames>[number]): string | null {
  switch (record.inactiveReason) {
    case 'NO_PRESENT_HUMANS':
      return 'Stopped because no players remained present.';
    case 'LEFT_WITH_TOO_FEW_ONLINE_PLAYERS':
      return 'Stopped because not enough players remained online.';
    default:
      return null;
  }
}

function buildRunningMultiplayerMembers(
  gameId: string,
  runtime: ReturnType<typeof getGameRuntime>
): MultiplayerRunningMemberDto[] {
  const memberships = listMembershipsForGame(GAME_MEMBERSHIPS_DATA_PATH, gameId)
    .filter((entry) => entry.isActive)
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt) || left.accountId - right.accountId);
  const offlineBotControlledPlayerIds = runtime?.offlineBotControlledPlayerIds ?? new Set<number>();
  const authData = loadAuthData();
  const sessionByAccountId = new Map(
    authData.sessions
      .filter((session) => session.currentGameId === gameId)
      .map((session) => [session.accountId, session] as const)
  );

  return memberships.map((membership) => {
    const playerId = runtime?.galaxy.playerNameMap.get(membership.playerName) ?? null;
    const player = playerId !== null && runtime
      ? resolvePlayerById(runtime.galaxy, playerId)
      : null;
    const isOfflineBotControlled = playerId !== null && offlineBotControlledPlayerIds.has(playerId);
    const presence = sessionByAccountId.has(membership.accountId)
      ? getPresenceForGameAccount(MULTIPLAYER_PRESENCE_DATA_PATH, gameId, membership.accountId)
      : null;

    return {
      accountId: membership.accountId,
      playerName: membership.playerName,
      isAutoSkipTurn: !isOfflineBotControlled && presence?.state === 'AUTO_SKIP_TURN',
      isOfflineBotControlled,
      offlineBotProfileId: isOfflineBotControlled ? (player?.botProfileId ?? null) : null
    };
  });
}

function upsertDraftLobbyWithMemberships(lobby: MultiplayerLobbyState & { gameId: string; createdAt?: string; updatedAt?: string }): void {
  const now = new Date().toISOString();
  const existing = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, lobby.gameId);
  const normalizedLobby = upsertMultiplayerLobby(MULTIPLAYER_LOBBY_STORE_DATA_PATH, {
    ...lobby,
    createdAt: existing?.createdAt ?? lobby.createdAt ?? now,
    updatedAt: lobby.updatedAt ?? now
  });
  const existingMemberships = listMembershipsForGame(GAME_MEMBERSHIPS_DATA_PATH, lobby.gameId)
    .filter((entry) => entry.isActive);
  const activeAccountIds = new Set(normalizedLobby.members.map((member) => member.accountId));

  for (const membership of existingMemberships) {
    if (!activeAccountIds.has(membership.accountId)) {
      removeMembership(GAME_MEMBERSHIPS_DATA_PATH, lobby.gameId, membership.accountId);
    }
  }

  for (const member of normalizedLobby.members) {
    upsertMembership(GAME_MEMBERSHIPS_DATA_PATH, {
      gameId: normalizedLobby.gameId,
      accountId: member.accountId,
      playerName: member.playerName,
      role: member.accountId === normalizedLobby.hostAccountId ? 'HOST' : 'MEMBER',
      joinedAt: member.joinedAt,
      lastSeenAt: now,
      isActive: true
    });
  }

  updateGameRecord(GAME_REGISTRY_DATA_PATH, normalizedLobby.gameId, {
    hostAccountId: normalizedLobby.hostAccountId,
    hostPlayerName: normalizedLobby.hostPlayerName,
    updatedAt: normalizedLobby.updatedAt
  });
}

function removeAccountFromOtherDraftMultiplayerLobbies(accountId: number, exceptGameId: string): void {
  const memberships = listMembershipsForAccount(GAME_MEMBERSHIPS_DATA_PATH, accountId)
    .filter((entry) => entry.isActive && entry.gameId !== exceptGameId);

  for (const membership of memberships) {
    const record = getGameById(GAME_REGISTRY_DATA_PATH, membership.gameId);
    const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, membership.gameId);
    const isJoinableDraftLikeLobby = !!record
      && record.kind === 'MULTIPLAYER'
      && !!lobby
      && (record.status === 'DRAFT' || (record.status === 'RUNNING' && !hasGameRuntime(membership.gameId) && lobby.isResumeLobby));
    if (!isJoinableDraftLikeLobby) {
      continue;
    }
    if (!lobby || !lobby.members.some((member) => member.accountId === accountId)) {
      removeMembership(GAME_MEMBERSHIPS_DATA_PATH, membership.gameId, accountId);
      continue;
    }

    const nextLobby = leaveMultiplayerLobby(lobby, accountId);
    removeMembership(GAME_MEMBERSHIPS_DATA_PATH, membership.gameId, accountId);
    if (!nextLobby) {
      deleteMultiplayerLobby(MULTIPLAYER_LOBBY_STORE_DATA_PATH, membership.gameId);
      updateGameRecord(GAME_REGISTRY_DATA_PATH, membership.gameId, record.status === 'DRAFT'
        ? {
          status: 'ARCHIVED',
          updatedAt: new Date().toISOString()
        }
        : {
          updatedAt: new Date().toISOString()
        });
      continue;
    }

    upsertDraftLobbyWithMemberships({
      ...nextLobby,
      gameId: membership.gameId,
      createdAt: lobby.createdAt,
      updatedAt: new Date().toISOString()
    });
  }
}

function loadDraftMultiplayerLobbyForManagement(
  session: AuthSession,
  gameId: string
): {
  record: NonNullable<ReturnType<typeof getGameById>>;
  lobby: NonNullable<ReturnType<typeof getMultiplayerLobbyByGameId>>;
} | null {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  if (!record || record.kind !== 'MULTIPLAYER') {
    return null;
  }

  const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, gameId);
  if (!lobby) {
    return null;
  }

  if (!isLocalAdminSession(session) || session.accountId !== lobby.hostAccountId) {
    return null;
  }

  return { record, lobby };
}

function loadJoinableMultiplayerLobby(
  gameId: string
): {
  record: NonNullable<ReturnType<typeof getGameById>>;
  lobby: NonNullable<ReturnType<typeof getMultiplayerLobbyByGameId>>;
} | null {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  if (!record || record.kind !== 'MULTIPLAYER') {
    return null;
  }

  const lobby = getMultiplayerLobbyByGameId(MULTIPLAYER_LOBBY_STORE_DATA_PATH, gameId);
  if (!lobby) {
    return null;
  }

  if (record.status === 'DRAFT') {
    return { record, lobby };
  }

  if (record.status === 'RUNNING' && !hasGameRuntime(gameId) && lobby.isResumeLobby) {
    return { record, lobby };
  }

  return null;
}

function hydrateRunningMultiplayerGameFromLobby(
  authData: AuthData,
  session: AuthSession,
  gameId: string,
  lobby: NonNullable<ReturnType<typeof getMultiplayerLobbyByGameId>>
): LoadGameResponse {
  if (currentRuntimeGameId && currentRuntimeGameId !== gameId) {
    persistCurrentRuntimeStoreState();
  }

  if (lobby.mode === 'LOAD_SAVE') {
    const save = lobby.boundSaveId
      ? readGameSaveById(GAME_SAVES_DIRECTORY_PATH, lobby.boundSaveId)
      : null;
    if (!save) {
      throw new Error('Saved game not found.');
    }

    const hydrated = hydrateGameSave(save);
    applyLobbyLoadSeatsToGalaxy(hydrated.galaxy, lobby);
    currentGalaxy = hydrated.galaxy;
    currentGameOwnerId = session.accountId;
    currentGameOwnerPlayerName = session.playerName;
    currentGameSetup = hydrated.setup;
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);
    resetActiveTurnState();
    clearBotDecisionTracesV2();
    resetBotAdminRuntimeState();
    registerRunningGame(authData, 'MULTIPLAYER', currentGalaxy, {
      gameId,
      ownerAccountId: session.accountId,
      ownerPlayerName: session.playerName,
      hostAccountId: lobby.hostAccountId,
      hostPlayerName: lobby.hostPlayerName,
      currentGameAccountIds: lobby.members.map((member) => member.accountId),
      memberships: lobby.members.map((member) => ({
        accountId: member.accountId,
        playerName: member.playerName,
        role: member.accountId === lobby.hostAccountId ? 'HOST' : 'MEMBER'
      }))
    });
    saveCurrentGameSnapshot();
  } else {
    const setup = normalizeGalaxySetup({
      ...lobby.setup,
      playerAmount: lobby.members.length
    });
    const nextGalaxy = new GalaxyCreator(setup).createGalaxy(
      lobby.members.map((member) => member.playerName)
    );
    if (setup.smokeTestScenario) {
      applySmokeTestScenario(nextGalaxy, setup.smokeTestScenario);
    }
    synchronizeTradePortState(nextGalaxy);
    generateSelfReportsForHumanPlayers(nextGalaxy, nextGalaxy.currentTurn);
    currentGalaxy = nextGalaxy;
    currentGameOwnerId = session.accountId;
    currentGameOwnerPlayerName = session.playerName;
    currentGameSetup = setup;
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);
    resetActiveTurnState();
    clearBotDecisionTracesV2();
    resetBotAdminRuntimeState();
    registerRunningGame(authData, 'MULTIPLAYER', currentGalaxy, {
      gameId,
      ownerAccountId: session.accountId,
      ownerPlayerName: session.playerName,
      hostAccountId: lobby.hostAccountId,
      hostPlayerName: lobby.hostPlayerName,
      currentGameAccountIds: lobby.members.map((member) => member.accountId),
      memberships: lobby.members.map((member) => ({
        accountId: member.accountId,
        playerName: member.playerName,
        role: member.accountId === lobby.hostAccountId ? 'HOST' : 'MEMBER'
      }))
    });
    saveCurrentGameSnapshot();
  }

  deleteMultiplayerLobby(MULTIPLAYER_LOBBY_STORE_DATA_PATH, gameId);
  return {
    player: toPlayerSession(session, currentGalaxy),
    galaxy: buildGalaxySnapshot(currentGalaxy)
  };
}

function canSessionViewGameRecord(gameId: string, session: AuthSession): boolean {
  return session.localAdmin === true
    || session.currentGameId === gameId
    || isAccountMemberOfGame(GAME_MEMBERSHIPS_DATA_PATH, gameId, session.accountId);
}

function buildGameSaveGroupStatusLabel(
  record: ReturnType<typeof getGameById>,
  gameId: string | null,
  options: { isCurrentGame: boolean; isLastClosedGame: boolean }
): string {
  if (options.isCurrentGame) {
    return 'Current selected game';
  }

  if (options.isLastClosedGame) {
    return 'Recently closed single-player game';
  }

  if (!record) {
    return gameId ? 'Tracked saves' : 'Untracked saves';
  }

  if (hasGameRuntime(record.gameId)) {
    return 'Active runtime';
  }

  if (record.kind === 'MULTIPLAYER' && record.status === 'RUNNING') {
    return 'Saved / Inactive';
  }

  if (record.status === 'ARCHIVED') {
    return 'Archived';
  }

  return record.kind === 'SINGLEPLAYER' ? 'Singleplayer saves' : 'Multiplayer saves';
}

function buildGameSaveGroups(
  saves: GameSavesResponse['saves'],
  session: AuthSession | null
): GameSavesResponse['saveGroups'] {
  const grouped = new Map<string, GameSavesResponse['saveGroups'][number]>();

  for (const save of saves) {
    const key = save.gameId ?? '__untracked__';
    const existing = grouped.get(key);
    if (existing) {
      existing.saves.push(save);
      continue;
    }

    const record = save.gameId ? getGameById(GAME_REGISTRY_DATA_PATH, save.gameId) : null;
    const isCurrentGame = session?.currentGameId === save.gameId;
    const isLastClosedGame = session?.lastClosedGameId === save.gameId;
    grouped.set(key, {
      gameId: save.gameId,
      gameName: record?.name ?? save.galaxyName,
      gameKind: record?.kind ?? null,
      statusLabel: buildGameSaveGroupStatusLabel(record, save.gameId, { isCurrentGame, isLastClosedGame }),
      isCurrentGame,
      isLastClosedGame,
      saves: [save]
    });
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      saves: [...group.saves].sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
    }))
    .sort((left, right) => {
      const leftRank = left.isCurrentGame ? 0 : left.isLastClosedGame ? 1 : 2;
      const rightRank = right.isCurrentGame ? 0 : right.isLastClosedGame ? 1 : 2;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftLatest = left.saves[0] ? Date.parse(left.saves[0].savedAt) : 0;
      const rightLatest = right.saves[0] ? Date.parse(right.saves[0].savedAt) : 0;
      return rightLatest - leftLatest;
    });
}

function buildGameSavesResponse(session: AuthSession | null, gameId: string | null = null): GameSavesResponse {
  let saves: ReturnType<typeof listGameSaveSummaries> = [];
  try {
    saves = gameId
      ? listGameSaveSummariesForGame(GAME_SAVES_DIRECTORY_PATH, gameId)
      : listGameSaveSummaries(GAME_SAVES_DIRECTORY_PATH);
  } catch (error) {
    console.error('Failed to read game saves.', error);
  }

  const saveGroups = buildGameSaveGroups(saves, session);
  const currentSelectedGameRecord = session?.currentGameId
    ? getGameById(GAME_REGISTRY_DATA_PATH, session.currentGameId)
    : null;
  const recommendedGroup = session?.lastClosedGameId
    ? saveGroups.find((group) => group.gameId === session.lastClosedGameId)
    : null;

  return {
    saves,
    saveGroups,
    recommendedReopen: recommendedGroup && recommendedGroup.saves[0] && recommendedGroup.gameId
      ? {
        gameId: recommendedGroup.gameId,
        gameName: recommendedGroup.gameName,
        gameKind: recommendedGroup.gameKind,
        statusLabel: recommendedGroup.statusLabel,
        reasonText: 'Recently closed single-player game. Load the latest save to reopen it.',
        save: recommendedGroup.saves[0]
      }
      : null,
    activeGame: gameId === null || currentRuntimeGameId === gameId
      ? buildActiveGameSummary()
      : null,
    currentSelectedGameId: session?.currentGameId ?? null,
    currentSelectedGameName: currentSelectedGameRecord?.name ?? null,
    isLoggedIn: !!session,
    currentAccountId: session?.accountId ?? null,
    currentPlayerIsLocalAdmin: session?.localAdmin === true,
    canManage: session?.localAdmin === true,
    canManageReason: session
      ? session.localAdmin === true
        ? null
        : 'Local admin privileges are required to manage saves.'
      : 'Login required to manage saves.'
  };
}

function createSession(data: AuthData, account: AuthAccount, timestamp: string): AuthSession {
  const session: AuthSession = {
    token: randomUUID(),
    accountId: account.id,
    playerName: account.playerName,
    localAdmin: account.localAdmin === true,
    language: account.language,
    createdAt: timestamp,
    lastSeenAt: timestamp,
    currentGameId: account.currentGameId,
    lastClosedGameId: account.lastClosedGameId,
    lastClosedAt: account.lastClosedAt,
    pendingPresenceRemovedNoticeGameId: null
  };

  data.sessions.push(session);
  return session;
}

function toPlayerSession(session: AuthSession, galaxy: Galaxy | null = currentGalaxy): PlayerSession {
  const player = galaxy ? resolvePlayerFromSession(galaxy, session) : null;
  return {
    id: session.accountId,
    playerName: session.playerName,
    token: session.token,
    localAdmin: session.localAdmin === true,
    language: session.language,
    tutorialRead: player?.tutorialRead ?? createTutorialReadState(false),
    unreadReportCount: player?.reports.filter((report) => !report.isRead && report.reportType !== ReportType.MESSAGE).length ?? 0,
    unreadMailCount: player?.messages.filter((message) => !message.isRead).length ?? 0,
    pendingRequestCount: player && galaxy ? countPendingMailRequestsForPlayer(galaxy, player.playerId) : 0,
    currentGameId: session.currentGameId
  };
}

function getRequestIdentity(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() || req.ip || 'unknown';
  }

  return req.ip || 'unknown';
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';
  return token.trim() ? token.trim() : null;
}

function getAuthSession(req: Request): { data: AuthData; session: AuthSession } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const data = loadAuthData();
  const session = data.sessions.find((entry) => entry.token === token);
  if (!session) {
    return null;
  }

  const account = data.accounts.find((entry) => entry.id === session.accountId);
  if (!account || account.playerName !== session.playerName || account.status !== 'ACTIVE') {
    data.sessions = data.sessions.filter((entry) => entry.token !== token);
    saveAuthData(data);
    return null;
  }

  session.localAdmin = account.localAdmin === true;
  session.language = account.language;
  session.currentGameId = account.currentGameId;
  session.lastSeenAt = new Date().toISOString();
  saveAuthData(data);

  return { data, session };
}

function isLocalAdminSession(session: AuthSession): boolean {
  return session.localAdmin === true;
}

function isCurrentGameController(session: AuthSession): boolean {
  return isLocalAdminSession(session) && currentGameOwnerId !== null && session.accountId === currentGameOwnerId;
}

function canSessionAccessCurrentGame(galaxy: Galaxy, session: AuthSession): boolean {
  return resolvePlayerId(galaxy, session) !== null;
}

function resolveSessionRuntimeAccess(
  auth: { data: AuthData; session: AuthSession },
  requestedGameId?: string | null
):
  | {
    gameId: string;
    runtime: NonNullable<ReturnType<typeof getGameRuntime>>;
    auth: { data: AuthData; session: AuthSession };
  }
  | ApiRouteError {
  const explicitGameId = typeof requestedGameId === 'string' && requestedGameId.trim()
    ? requestedGameId.trim()
    : null;
  const gameId = explicitGameId ?? auth.session.currentGameId ?? currentRuntimeGameId;
  if (!gameId) {
    return createApiRouteError(404, 'No active game.', 'api.errors.noCurrentGameSelected');
  }

  if (!canSessionViewGameRecord(gameId, auth.session)) {
    return createApiRouteError(404, 'Game not found.', 'api.errors.gameNotFound');
  }

  const runtime = getGameRuntime(gameId);
  if (!runtime) {
    return createApiRouteError(
      409,
      'This game is not currently active. Ask localAdmin to resume it.',
      'api.errors.gameNotActiveAskAdmin'
    );
  }

  reconcileOfflineBotControlledSeatsForRuntime(gameId, runtime, auth.data);

  if (currentRuntimeGameId !== gameId) {
    switchCurrentRuntime(gameId);
  }

  return {
    gameId,
    runtime: getGameRuntime(gameId) ?? runtime,
    auth
  };
}

function resolveAuthenticatedGameAccess(
  req: Request,
  options: { markPresenceSeen?: boolean } = {}
):
  | {
    gameId: string;
    runtime: NonNullable<ReturnType<typeof getGameRuntime>>;
    galaxy: Galaxy;
    auth: { data: AuthData; session: AuthSession };
    playerId: number;
    readyPlayerIds: ReadonlySet<number>;
    isProcessing: boolean;
  }
  | ApiRouteError {
  const auth = getAuthSession(req);
  if (!auth) {
    return createApiRouteError(401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  const runtimeAccess = resolveSessionRuntimeAccess(auth);
  if ('error' in runtimeAccess) {
    return runtimeAccess;
  }

  const { runtime } = runtimeAccess;
  const playerId = resolvePlayerId(runtime.galaxy, auth.session);
  if (playerId === null) {
    return createApiRouteError(403, 'Forbidden.', 'api.errors.forbidden');
  }

  if (options.markPresenceSeen === true && isRunningMultiplayerGame(runtime.gameId)) {
    markPresenceSeen(MULTIPLAYER_PRESENCE_DATA_PATH, runtime.gameId, auth.session.accountId);
  }
  const lifecycle = reconcileRunningMultiplayerLifecycle(runtime.gameId, auth.data);
  if (lifecycle.unloaded) {
    return createApiRouteError(
      409,
      'This game is not currently active. Ask localAdmin to resume it.',
      'api.errors.gameNotActiveAskAdmin'
    );
  }

  const refreshedRuntime = getGameRuntime(runtime.gameId);
  if (!refreshedRuntime) {
    return createApiRouteError(
      409,
      'This game is not currently active. Ask localAdmin to resume it.',
      'api.errors.gameNotActiveAskAdmin'
    );
  }

  synchronizeJumpGateRequests(refreshedRuntime.galaxy);
  synchronizeMaintenanceRequests(refreshedRuntime.galaxy);
  synchronizeSupportRequests(refreshedRuntime.galaxy);
  if (synchronizeTradePortState(refreshedRuntime.galaxy)) {
    const nextPresentation = buildPresentationDataByPlayer(refreshedRuntime.galaxy);
    updateGameRuntime(refreshedRuntime.gameId, { presentationByPlayer: nextPresentation });
    currentGalaxyPresentationByPlayer = nextPresentation;
  }

  return {
    gameId: refreshedRuntime.gameId,
    runtime: refreshedRuntime,
    galaxy: refreshedRuntime.galaxy,
    auth,
    playerId,
    readyPlayerIds: refreshedRuntime.currentTurnReadyPlayerIds,
    isProcessing: refreshedRuntime.isTurnProcessing
  };
}

function resolveAuthenticatedGameAccessForGame(
  req: Request,
  requestedGameId: string,
  options: { markPresenceSeen?: boolean } = {}
):
  | {
    gameId: string;
    runtime: NonNullable<ReturnType<typeof getGameRuntime>>;
    galaxy: Galaxy;
    auth: { data: AuthData; session: AuthSession };
    playerId: number;
    readyPlayerIds: ReadonlySet<number>;
    isProcessing: boolean;
  }
  | ApiRouteError {
  const gameId = typeof requestedGameId === 'string' ? requestedGameId.trim() : '';
  if (!gameId) {
    return createApiRouteError(400, 'Invalid game id.', 'api.errors.invalidGameId');
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return createApiRouteError(401, 'Unauthorized.', 'api.errors.unauthorized');
  }

  const runtimeAccess = resolveSessionRuntimeAccess(auth, gameId);
  if ('error' in runtimeAccess) {
    return runtimeAccess;
  }

  const { runtime } = runtimeAccess;
  const playerId = resolvePlayerId(runtime.galaxy, auth.session);
  if (playerId === null) {
    return createApiRouteError(403, 'Forbidden.', 'api.errors.forbidden');
  }

  if (options.markPresenceSeen === true && isRunningMultiplayerGame(gameId)) {
    markPresenceSeen(MULTIPLAYER_PRESENCE_DATA_PATH, gameId, auth.session.accountId);
  }
  const lifecycle = reconcileRunningMultiplayerLifecycle(gameId, auth.data);
  if (lifecycle.unloaded) {
    return createApiRouteError(
      409,
      'This game is not currently active. Ask localAdmin to resume it.',
      'api.errors.gameNotActiveAskAdmin'
    );
  }

  const refreshedRuntime = getGameRuntime(gameId);
  if (!refreshedRuntime) {
    return createApiRouteError(
      409,
      'This game is not currently active. Ask localAdmin to resume it.',
      'api.errors.gameNotActiveAskAdmin'
    );
  }

  synchronizeJumpGateRequests(refreshedRuntime.galaxy);
  synchronizeMaintenanceRequests(refreshedRuntime.galaxy);
  synchronizeSupportRequests(refreshedRuntime.galaxy);
  if (synchronizeTradePortState(refreshedRuntime.galaxy)) {
    const nextPresentation = buildPresentationDataByPlayer(refreshedRuntime.galaxy);
    updateGameRuntime(gameId, { presentationByPlayer: nextPresentation });
    if (currentRuntimeGameId === gameId) {
      currentGalaxyPresentationByPlayer = nextPresentation;
    }
  }

  return {
    gameId,
    runtime: refreshedRuntime,
    galaxy: refreshedRuntime.galaxy,
    auth,
    playerId,
    readyPlayerIds: refreshedRuntime.currentTurnReadyPlayerIds,
    isProcessing: refreshedRuntime.isTurnProcessing
  };
}

function resolveAuthenticatedController(req: Request):
  | { galaxy: Galaxy; auth: { data: AuthData; session: AuthSession } }
  | { status: number; error: string } {
  const auth = getAuthSession(req);
  if (!auth) {
    return { status: 401, error: 'Unauthorized.' };
  }

  const runtimeAccess = resolveSessionRuntimeAccess(auth);
  if ('error' in runtimeAccess) {
    return runtimeAccess;
  }

  if (!isCurrentGameController(auth.session)) {
    return { status: 403, error: 'Forbidden.' };
  }

  return {
    galaxy: runtimeAccess.runtime.galaxy,
    auth
  };
}

function resolvePlayerId(galaxy: Galaxy, session: AuthSession): number | null {
  return galaxy.playerNameMap.get(session.playerName) ?? null;
}

function resolvePlayerById(galaxy: Galaxy, playerId: number): Player | null {
  for (const player of galaxy.players) {
    if (player.playerId === playerId) {
      return player;
    }
  }

  return null;
}

function resolveAuthenticatedGamePlayer(req: Request):
  | { galaxy: Galaxy; player: Player; auth: { data: AuthData; session: AuthSession } }
  | ApiRouteError {
  const access = resolveAuthenticatedGameAccess(req);
  if ('error' in access) {
    return access;
  }

  const player = resolvePlayerById(access.galaxy, access.playerId);
  if (!player) {
    return createApiRouteError(404, 'Player not found in galaxy.', 'api.errors.playerNotFoundInGame');
  }

  return {
    galaxy: access.galaxy,
    player,
    auth: access.auth
  };
}

function handleEndTurnRequest(
  req: Request,
  res: express.Response,
  requestedGameId?: string
) {
  const access = requestedGameId
    ? resolveAuthenticatedGameAccessForGame(req, requestedGameId, { markPresenceSeen: true })
    : resolveAuthenticatedGameAccess(req, { markPresenceSeen: true });
  if ('error' in access) {
    return sendApiRouteError(res, access);
  }

  if (isTurnProcessing) {
    return sendApiError(
      res,
      409,
      'Turn processing is already in progress.',
      'api.gameplay.endTurn.processingInProgress'
    );
  }

  const player = resolvePlayerById(access.galaxy, access.playerId);
  if (!player) {
    return sendApiError(res, 404, 'Player not found in galaxy.', 'api.errors.playerNotFoundInGame');
  }

  const playerId = player.playerId;
  synchronizeJumpGateRequests(access.galaxy);
  synchronizeMaintenanceRequests(access.galaxy);
  synchronizeSupportRequests(access.galaxy);
  const pendingRequestCount = countPendingMailRequestsForPlayer(access.galaxy, playerId);
  const unreadMailCount = countUnreadMailMessagesForPlayer(access.galaxy, playerId);
  if (pendingRequestCount > 0 || unreadMailCount > 0) {
    return sendApiError(
      res,
      409,
      buildEndTurnMailBlockMessage(unreadMailCount, pendingRequestCount),
      'api.gameplay.endTurn.mailBlocked',
      buildEndTurnMailBlockParams(unreadMailCount, pendingRequestCount)
    );
  }

  const presenceSummary = reconcileReadyStateForOnlineHumans(access.gameId, access.runtime, access.auth.data);
  const minimumOnlineHumansRequired = minimumOnlineHumansRequiredForGame(access.gameId);
  if (presenceSummary.presentHumanCount < minimumOnlineHumansRequired) {
    const metadata = buildOnlineHumansRequiredMessageMetadata(access.gameId);
    return sendApiError(
      res,
      409,
      metadata.message ?? 'Not enough human players are online to progress this game.',
      metadata.key ?? 'api.gameplay.endTurn.notEnoughOnlineHumans',
      metadata.params
    );
  }
  if (presenceSummary.activeHumanCount < 1) {
    const metadata = buildActiveHumanRequiredMessageMetadata(access.gameId);
    return sendApiError(
      res,
      409,
      metadata.message ?? 'At least 1 active human player must be present to progress this game.',
      metadata.key ?? 'api.gameplay.endTurn.activeHumanRequired',
      metadata.params
    );
  }

  const requiresReady = requiresAllPlayersReady(access.galaxy);
  if (requiresReady) {
    currentTurnReadyPlayerIds.add(playerId);
    persistCurrentRuntimeStoreState();
    if (!areAllHumanPlayersReady(access.galaxy, currentTurnReadyPlayerIds, presenceSummary.blockingPlayerIds)) {
      const response: EndTurnResponse = {
        player: toPlayerSession(access.auth.session, access.galaxy),
        galaxy: buildGalaxySnapshot(access.galaxy),
        resolution: 'WAITING',
        turnStatus: buildGameTurnStatusResponse(access)
      };
      return res.status(200).json(response);
    }
  }

  isTurnProcessing = true;
  persistCurrentRuntimeStoreState();

  try {
    const resolvedTurnNumber = access.galaxy.currentTurn + 1;
    runBotTurnPhaseV2(access.galaxy);
    resolvePhaseOneTurn(access.galaxy, resolvedTurnNumber, {
      botDifficultyPercent: currentGameSetup?.botDifficulty ?? 0
    });
    access.galaxy.currentTurn = resolvedTurnNumber;
    processSensorPhalanxTurnStart(access.galaxy, access.galaxy.currentTurn);
    expirePendingDiplomaticProposals(access.galaxy, access.galaxy.currentTurn);
    synchronizeJumpGateRequests(access.galaxy);
    synchronizeMaintenanceRequests(access.galaxy);
    synchronizeSupportRequests(access.galaxy);
    synchronizeTradePortState(access.galaxy);
    refreshOwnedPlanetSelfReportsForHumanPlayers(access.galaxy, access.galaxy.currentTurn);
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(access.galaxy);
    currentTurnReadyPlayerIds = new Set<number>();
    persistCurrentRuntimeStoreState();
    if (currentGameSetup && shouldAutoSaveAfterTurn(access.galaxy.currentTurn, currentGameSetup.autoSaveTurns)) {
      try {
        saveCurrentGameSnapshot();
      } catch (error) {
        console.error(`Auto save failed on turn ${access.galaxy.currentTurn}.`, error);
      }
    }
    updateCurrentRuntimeGameRegistryRecord();

    const response: EndTurnResponse = {
      player: toPlayerSession(access.auth.session, access.galaxy),
      galaxy: buildGalaxySnapshot(access.galaxy),
      resolution: 'RESOLVED',
      turnStatus: buildGameTurnStatusResponse(access)
    };

    return res.status(200).json(response);
  } catch (error) {
    currentTurnReadyPlayerIds = new Set<number>();
    persistCurrentRuntimeStoreState();
    console.error('End-turn processing failed.', error);
    return sendApiError(
      res,
      500,
      'Turn processing failed.',
      'api.gameplay.endTurn.processingFailed'
    );
  } finally {
    isTurnProcessing = false;
    persistCurrentRuntimeStoreState();
  }
}

function sendGameCommandError(
  res: express.Response,
  error: GameCommandError
) {
  const metadata = resolveGameCommandErrorMetadata(error);
  if (metadata.key) {
    return sendApiError(res, error.status, error.message, metadata.key, metadata.params);
  }
  return res.status(error.status).json({ error: error.message });
}

function resolveGameCommandErrorMetadata(error: GameCommandError): {
  key: string | null;
  params: ApiMessageParams | null;
} {
  switch (error.message) {
    case 'Queue full.':
      return { key: 'api.commands.common.queueFull', params: null };
    case 'Building requirements are not met.':
      return { key: 'api.commands.common.buildingRequirementsNotMet', params: null };
    case 'Technology requirements are not met.':
      return { key: 'api.commands.common.technologyRequirementsNotMet', params: null };
    case 'Insufficient resources.':
      return { key: 'api.commands.common.insufficientResources', params: null };
    case 'Only your own planets can be modified.':
      return { key: 'api.commands.common.onlyOwnPlanetModifiable', params: null };
    case 'Star system not found.':
      return { key: 'api.commands.common.starSystemNotFound', params: null };
    case 'Planet not found.':
      return { key: 'api.commands.common.planetNotFound', params: null };
    case 'Building type is already queued.':
      return { key: 'api.commands.building.alreadyQueued', params: null };
    case 'Unknown building type.':
      return { key: 'api.commands.building.unknownType', params: null };
    case 'Build Shipyard first.':
      return { key: 'api.commands.shipyard.buildShipyardFirst', params: null };
    case 'Unknown ship type.':
      return { key: 'api.commands.shipyard.unknownShipType', params: null };
    case 'Unknown defence type.':
      return { key: 'api.commands.shipyard.unknownDefenceType', params: null };
    case 'Bomb Depot capacity reached.':
      return { key: 'api.commands.shipyard.bombDepotCapacityReached', params: null };
    case 'Build Research Lab first.':
      return { key: 'api.commands.research.buildResearchLabFirst', params: null };
    case 'Research Lab is currently assigned as helper.':
      return { key: 'api.commands.research.labAssignedAsHelper', params: null };
    case 'Unknown technology type.':
      return { key: 'api.commands.research.unknownTechnologyType', params: null };
    case 'Technology is already being researched.':
      return { key: 'api.commands.research.alreadyQueued', params: null };
    case 'Helper planet star system not found.':
      return { key: 'api.commands.research.helperSystemNotFound', params: null };
    case 'Helper planet not found.':
      return { key: 'api.commands.research.helperPlanetNotFound', params: null };
    case 'Helper planet must be owned by you.':
      return { key: 'api.commands.research.helperPlanetMustBeOwned', params: null };
    case 'Selected helper planet has no Research Lab.':
      return { key: 'api.commands.research.helperNeedsResearchLab', params: null };
    case 'Selected helper lab is busy.':
      return { key: 'api.commands.research.helperLabBusy', params: null };
    case 'Too many helper labs assigned.':
      return { key: 'api.commands.research.tooManyHelperLabs', params: null };
    case 'Mission type is not available in phase 1.':
      return { key: 'api.commands.fleet.missionUnavailable', params: null };
    case 'Mission definition not found.':
      return { key: 'api.commands.fleet.missionDefinitionNotFound', params: null };
    case 'Origin planet not found.':
      return { key: 'api.commands.fleet.originPlanetNotFound', params: null };
    case 'Target planet not found.':
      return { key: 'api.commands.fleet.targetPlanetNotFound', params: null };
    case 'Origin planet must be owned by you.':
      return { key: 'api.commands.fleet.originPlanetMustBeOwned', params: null };
    case 'Player not found.':
      return { key: 'api.commands.fleet.playerNotFound', params: null };
    case 'Active fleet limit reached. Upgrade COMPUTER_TECHNOLOGY to control more fleets.':
      return { key: 'api.commands.fleet.activeFleetLimitReached', params: null };
    case 'Select at least one ship.':
      return { key: 'api.commands.fleet.selectAtLeastOneShip', params: null };
    case 'Insufficient hangar space for carried ships and bombs.':
      return { key: 'api.commands.fleet.insufficientHangarSpace', params: null };
    case 'Insufficient bomber hangar space for carried bombs.':
      return { key: 'api.commands.fleet.insufficientBomberHangarSpace', params: null };
    case 'Insufficient cargo space.':
      return { key: 'api.commands.fleet.insufficientCargoSpace', params: null };
    case 'Insufficient resources for cargo and fuel.':
      return { key: 'api.commands.fleet.insufficientResourcesCargoFuel', params: null };
    case 'Jump Gate requires an owned target planet.':
      return { key: 'api.commands.fleet.jumpGateRequiresOwnedTarget', params: null };
    case 'Requested ship selection is no longer available on origin planet.':
      return { key: 'api.commands.fleet.requestedShipSelectionUnavailable', params: null };
    default:
      return { key: null, params: null };
  }
}

function upsertDiplomaticRelation(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number,
  status: DiplomaticStatusType
): void {
  const playerAId = Math.min(leftPlayerId, rightPlayerId);
  const playerBId = Math.max(leftPlayerId, rightPlayerId);
  const existingIndex = galaxy.diplomaticRelations.findIndex((relation) =>
    relation.playerAId === playerAId && relation.playerBId === playerBId
  );

  if (status === DiplomaticStatus.NEUTRAL) {
    if (existingIndex >= 0) {
      galaxy.diplomaticRelations.splice(existingIndex, 1);
    }
    return;
  }

  const nextRelation: DiplomaticRelation = {
    playerAId,
    playerBId,
    status
  };

  if (existingIndex >= 0) {
    galaxy.diplomaticRelations[existingIndex] = nextRelation;
  } else {
    galaxy.diplomaticRelations.push(nextRelation);
  }

  galaxy.diplomaticRelations.sort((left, right) =>
    left.playerAId - right.playerAId || left.playerBId - right.playerBId
  );
}

function createDiplomacyResolver(galaxy: Galaxy) {
  return new DiplomacyResolver(galaxy.diplomaticRelations);
}

function resolvePlayerFromSession(galaxy: Galaxy, session: AuthSession): Player | null {
  const playerId = resolvePlayerId(galaxy, session);
  if (playerId === null) {
    return null;
  }

  return resolvePlayerById(galaxy, playerId);
}

function calculateMaxBuildingQueueLength(planet: Planet, player: Player): number {
  const roboticsFactoryLevel = planet.getBuildingLevel(BUILDING_TYPE_ROBOTICS_FACTORY);
  const computerTechnologyLevel = player.getTechLevel(TECH_TYPE_COMPUTER_TECHNOLOGY);
  const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechnologyLevel + roboticsFactoryLevel));
  return Math.max(1, Math.floor(rawLimit));
}

function calculateMaxShipyardQueueLength(planet: Planet, player: Player): number {
  const shipyardLevel = planet.getBuildingLevel(BUILDING_TYPE_SHIPYARD);
  const computerTechnologyLevel = player.getTechLevel(TECH_TYPE_COMPUTER_TECHNOLOGY);
  const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechnologyLevel + shipyardLevel));
  return Math.max(1, Math.floor(rawLimit));
}

function calculateMaxLabsPerTechnology(player: Player): number {
  const irnLevel = player.getTechLevel(TECH_TYPE_INTERGALACTIC_RESEARCH_NETWORK);
  const rawLimit = Math.floor((1.5 * Math.sqrt(Math.max(0, irnLevel))) + 1);
  return Math.max(1, rawLimit);
}

function hasBuildingRequirements(
  planet: Planet,
  building: Building,
  nextLevel: number
): boolean {
  for (const requirement of building.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasTechnologyRequirements(player: Player, building: Building, nextLevel: number): boolean {
  for (const requirement of building.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasShipBuildingRequirements(planet: Planet, ship: Ship): boolean {
  for (const requirement of ship.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasShipTechnologyRequirements(player: Player, ship: Ship): boolean {
  for (const requirement of ship.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasDefenceBuildingRequirements(planet: Planet, defence: Defence): boolean {
  for (const requirement of defence.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasDefenceTechnologyRequirements(player: Player, defence: Defence): boolean {
  for (const requirement of defence.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasResearchBuildingRequirements(
  planet: Planet,
  technology: Technology,
  nextLevel: number
): boolean {
  for (const requirement of technology.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasResearchTechnologyRequirements(
  player: Player,
  technology: Technology,
  nextLevel: number
): boolean {
  for (const requirement of technology.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function parseOptionalInt(value: unknown): number | null {
  if (Array.isArray(value)) {
    return parseOptionalInt(value[0]);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseNonNegativeInt(value: unknown): number | null {
  const parsed = parseOptionalInt(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseBodyNonNegativeInt(value: unknown): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const parsed = value as number;
  if (parsed < 0) {
    return null;
  }

  return parsed;
}

function parseBodyCoordinates(value: unknown): ClientCoordinates | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<'x' | 'y' | 'z', unknown>;
  const x = parseBodyNonNegativeInt(candidate.x);
  const y = parseBodyNonNegativeInt(candidate.y);
  const z = parseBodyNonNegativeInt(candidate.z);
  if (x === null || y === null || z === null) {
    return null;
  }

  return { x, y, z };
}

function parseBodyPositiveInt(value: unknown): number | null {
  return parseBodyIntInRange(value, 1, Number.MAX_SAFE_INTEGER);
}

function parseRoutePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBotProfileId(value: unknown): BotProfileId | null {
  if (typeof value !== 'string') {
    return null;
  }

  return BOT_PROFILE_IDS.includes(value as BotProfileId)
    ? value as BotProfileId
    : null;
}

function parseBodyIntInRange(value: unknown, min: number, max: number): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const parsed = value as number;
  if (parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function normalizeDiplomaticStatus(value: unknown): DiplomaticStatusType | null {
  if (typeof value !== 'string' || !DIPLOMATIC_STATUS_VALUES.has(value)) {
    return null;
  }

  return value as DiplomaticStatusType;
}

function normalizeSupportRequestType(value: unknown): SupportRequestTypeDto | null {
  return value === 'RESOURCE_SUPPORT'
    || value === 'PLANET_REPAIR'
    || value === 'PLANET_DEFENSE'
    || value === 'ATTACK_TARGET'
    || value === 'BOMBARD_TARGET'
    || value === 'SIEGE_TARGET'
    ? value
    : null;
}

function parseBodyReportIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const reportIds: number[] = [];
  for (const item of value) {
    const reportId = parseBodyNonNegativeInt(item);
    if (reportId === null) {
      return null;
    }

    reportIds.push(reportId);
  }

  return reportIds;
}

function parseDeleteMailRequestRefs(
  value: unknown
): Array<{ requestId: number; requestType: MailRequestDto['requestType'] }> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const refs: Array<{ requestId: number; requestType: MailRequestDto['requestType'] }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as {
      requestId?: unknown;
      requestType?: unknown;
    };
    const requestId = parseBodyPositiveInt(candidate.requestId);
    const requestType = candidate.requestType;
    if (
      requestId === null
      || (requestType !== 'DIPLOMACY_PROPOSAL' && requestType !== 'MAINTENANCE' && requestType !== 'JUMP_GATE' && requestType !== 'SUPPORT')
    ) {
      return null;
    }

    refs.push({
      requestId,
      requestType
    });
  }

  return refs;
}

function parseBodyNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0) {
    return null;
  }

  return value;
}

function normalizeStarSystemNoteText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > STAR_SYSTEM_NOTE_TEXT_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function normalizePlayerMessageTitle(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PLAYER_MESSAGE_TITLE_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function normalizePlayerMessageBody(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PLAYER_MESSAGE_BODY_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function normalizeStarSystemNoteBorderColor(value: unknown): NoteBorderColorType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return NOTE_BORDER_COLOR_VALUES.has(value) ? (value as NoteBorderColorType) : null;
}

function normalizeBuildingType(value: unknown): BuildingTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return BUILDING_TYPE_VALUES.has(value) ? (value as BuildingTypeType) : null;
}

function normalizeShipType(value: unknown): ShipTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return SHIP_TYPE_VALUES.has(value) ? (value as ShipTypeType) : null;
}

function normalizeDefenceType(value: unknown): DefenceTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return DEFENCE_TYPE_VALUES.has(value) ? (value as DefenceTypeType) : null;
}

function normalizeFleetMissionType(value: unknown): FleetMissionTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return FLEET_MISSION_TYPE_VALUES.has(value) ? (value as FleetMissionTypeType) : null;
}

function normalizeTechnologyType(value: unknown): TechnologyTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return TECHNOLOGY_TYPE_VALUES.has(value) ? (value as TechnologyTypeType) : null;
}

function parseResearchHelperCoordinates(value: unknown): ClientCoordinates[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: ClientCoordinates[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as { x?: unknown; y?: unknown; z?: unknown };
    const x = parseBodyNonNegativeInt(candidate.x);
    const y = parseBodyNonNegativeInt(candidate.y);
    const z = parseBodyNonNegativeInt(candidate.z);
    if (x === null || y === null || z === null) {
      return null;
    }

    parsed.push({ x, y, z });
  }

  return parsed;
}

function parseMissionCoordinates(value: unknown): ClientCoordinates | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
  const x = parseBodyNonNegativeInt(candidate.x);
  const y = parseBodyNonNegativeInt(candidate.y);
  const z = parseBodyNonNegativeInt(candidate.z);
  if (x === null || y === null || z === null) {
    return null;
  }

  return { x, y, z };
}

function parseStarSystemCoordinates(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { x?: unknown; y?: unknown };
  const x = parseBodyNonNegativeInt(candidate.x);
  const y = parseBodyNonNegativeInt(candidate.y);
  if (x === null || y === null) {
    return null;
  }

  return { x, y };
}

function parseResourcesPackPayload(value: unknown): ResourcesPackType | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { metal?: unknown; crystal?: unknown; deuterium?: unknown };
  const metal = parseBodyNonNegativeInt(candidate.metal);
  const crystal = parseBodyNonNegativeInt(candidate.crystal);
  const deuterium = parseBodyNonNegativeInt(candidate.deuterium);
  if (metal === null || crystal === null || deuterium === null) {
    return null;
  }

  return {
    metal,
    crystal,
    deuterium
  } as ResourcesPackType;
}

function parseFleetShipSelections(value: unknown): CreateFleetShipSelectionEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const combined = new Map<ShipTypeType, { undamagedAmount: number; damagedAmount: number }>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as {
      type?: unknown;
      undamagedAmount?: unknown;
      damagedAmount?: unknown;
    };
    const shipType = normalizeShipType(candidate.type);
    const undamagedAmount = parseBodyIntInRange(candidate.undamagedAmount ?? 0, 0, 100000);
    const damagedAmount = parseBodyIntInRange(candidate.damagedAmount ?? 0, 0, 100000);
    if (!shipType || undamagedAmount === null || damagedAmount === null) {
      return null;
    }

    if (undamagedAmount <= 0 && damagedAmount <= 0) {
      return null;
    }

    const current = combined.get(shipType) ?? { undamagedAmount: 0, damagedAmount: 0 };
    current.undamagedAmount += undamagedAmount;
    current.damagedAmount += damagedAmount;
    combined.set(shipType, current);
  }

  return Array.from(combined.entries()).map(([type, amounts]) => ({
    type,
    undamagedAmount: amounts.undamagedAmount,
    damagedAmount: amounts.damagedAmount
  }));
}

function parseSupportShipAmounts(value: unknown): ShipAmountEntry[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const combined = new Map<ShipTypeType, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as {
      type?: unknown;
      amount?: unknown;
    };
    const shipType = normalizeShipType(candidate.type);
    const amount = parseBodyIntInRange(candidate.amount ?? 0, 0, 100000);
    if (!shipType || amount === null || amount <= 0) {
      return null;
    }

    combined.set(shipType, (combined.get(shipType) ?? 0) + amount);
  }

  return Array.from(combined.entries()).map(([type, amount]) => ({
    type,
    amount
  }));
}

function parseFleetBombSelections(value: unknown): CreateFleetBombSelectionEntry[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const combined = new Map<DefenceTypeType, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as {
      type?: unknown;
      amount?: unknown;
    };
    const defenceType = normalizeDefenceType(candidate.type);
    const amount = parseBodyIntInRange(candidate.amount, 1, 100000);
    if (!defenceType || amount === null || !isPlanetaryBombDefenceType(defenceType)) {
      return null;
    }

    combined.set(defenceType, (combined.get(defenceType) ?? 0) + amount);
  }

  return Array.from(combined.entries()).map(([type, amount]) => ({ type, amount }));
}

function parseBombardmentPriorities(value: unknown): BombardmentPrioritiesType | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    main?: unknown;
    secondary?: unknown;
    tertiary?: unknown;
  };

  const raw = {
    main: candidate.main ?? null,
    secondary: candidate.secondary ?? null,
    tertiary: candidate.tertiary ?? null
  };

  const slots = [raw.main, raw.secondary, raw.tertiary];
  if (slots.some((entry) => entry !== null && !isBombardmentPrioritySelection(entry))) {
    return null;
  }

  return normalizeBombardmentPriorities({
    main: raw.main as BombardmentPrioritySelectionType | null,
    secondary: raw.secondary as BombardmentPrioritySelectionType | null,
    tertiary: raw.tertiary as BombardmentPrioritySelectionType | null
  });
}

function countPlanetUndamagedShipsByType(planet: Planet): Map<ShipTypeType, number> {
  return ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
}

function countPlanetDamagedShipsByType(planet: Planet): Map<ShipTypeType, number> {
  return ManyShips.damagedCountByType(planet.rBDSFTQ.ships);
}

function countPlanetBombsByType(planet: Planet): Map<DefenceTypeType, number> {
  const counts = new Map<DefenceTypeType, number>();
  for (const [type, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
    if (!isPlanetaryBombDefenceType(type)) {
      continue;
    }

    counts.set(type, amount);
  }

  return counts;
}

function toShipAmountEntriesFromSelections(
  ships: Array<Pick<ShipSelectionEntryType, 'type' | 'undamagedAmount' | 'damagedAmount'>>
): Array<{ type: ShipTypeType; amount: number }> {
  return ships.map((ship) => ({
    type: ship.type,
    amount: ship.undamagedAmount + ship.damagedAmount
  }));
}

function toManyShipsFromShipAmounts(
  ships: Array<{ type: ShipTypeType; amount: number }>
): ManyShipsType {
  const manyShips = ManyShips.empty();
  for (const ship of ships) {
    manyShips.addUndamaged(ship.type, ship.amount);
  }

  return manyShips;
}

function calculateBombHangarUsage(bombs: Array<{ type: DefenceTypeType; amount: number }>): number {
  let total = 0;
  for (const bomb of bombs) {
    const blueprint = DEFENCE_BLUEPRINTS.defencesMap.get(bomb.type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.size) * Math.max(0, bomb.amount);
  }

  return total;
}

function calculateFleetCargoCapacity(ships: Array<{ type: ShipTypeType; amount: number }>): number {
  let capacity = 0;
  for (const ship of ships) {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(ship.type);
    if (!blueprint) {
      continue;
    }

    capacity += blueprint.cargoCapacity * ship.amount;
  }

  return capacity;
}

function calculateTravelDistance(origin: ClientCoordinates, target: ClientCoordinates): number {
  return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
}

function toPlanetCoordinates(planet: Planet): ClientCoordinates {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: Math.max(0, planet.basicInfo.order - 1)
  };
}

function remainingTravelTurnsForFleet(fleet: Fleet, currentTurn: number): number {
  if (fleet.state !== FleetState.MOVING_TO_TARGET) {
    return 0;
  }

  const elapsedTurns = Math.max(0, currentTurn - fleet.createdAtTurn);
  return Math.max(0, fleet.travelTurns - elapsedTurns);
}

function isAlliedSensorPhalanxContact(
  diplomacyResolver: InstanceType<typeof DiplomacyResolver>,
  viewerPlayerId: number,
  fleetOwnerId: number
): boolean {
  const status = diplomacyResolver.getStatus(viewerPlayerId, fleetOwnerId);
  return status === DiplomaticStatus.SELF || status === DiplomaticStatus.ALLIED;
}

function toSensorPhalanxCapabilitiesDto(
  planet: Planet,
  origin: ClientCoordinates,
  currentTurn: number
): SensorPhalanxCapabilitiesDto {
  planet.synchronizeSensorPhalanxTurn(currentTurn);

  return {
    origin,
    level: planet.getBuildingLevel(BuildingType.SENSOR_PHALANX as BuildingTypeType),
    normalRange: planet.getSensorPhalanxNormalRange(),
    activeScanRange: planet.getSensorPhalanxActiveScanRange(),
    scanCostDeuterium: planet.getSensorPhalanxScanCost(),
    scansPerTurn: planet.getSensorPhalanxScansPerTurn(),
    scansUsedThisTurn: planet.rBDSFTQ.sensorPhalanxScansUsed,
    remainingScans: planet.getRemainingSensorPhalanxScans(currentTurn)
  };
}

function compareSensorPhalanxContacts(
  left: SensorPhalanxFleetContactDto,
  right: SensorPhalanxFleetContactDto
): number {
  const directionWeight = (contact: SensorPhalanxFleetContactDto) => contact.direction === 'INCOMING' ? 0 : 1;
  return directionWeight(left) - directionWeight(right)
    || left.etaTurns - right.etaTurns
    || right.fleetSize - left.fleetSize
    || Number(left.isAllied) - Number(right.isAllied);
}

function toSensorPhalanxFleetContactDto(
  fleet: Fleet,
  direction: 'INCOMING' | 'OUTGOING',
  currentTurn: number,
  isAllied: boolean
): SensorPhalanxFleetContactDto {
  return {
    direction,
    fleetSize: ManyShips.totalShipsCount(fleet.ships),
    etaTurns: remainingTravelTurnsForFleet(fleet, currentTurn),
    isAllied
  };
}

function buildSensorPhalanxScanResponse(
  galaxy: Galaxy,
  viewerPlayerId: number,
  originPlanet: Planet,
  origin: ClientCoordinates,
  targetPlanet: Planet,
  target: ClientCoordinates
): SensorPhalanxScanResponse {
  const diplomacyResolver = createDiplomacyResolver(galaxy);
  const contacts: SensorPhalanxFleetContactDto[] = [];

  for (const fleet of galaxy.activeFleets) {
    if (fleet.state !== FleetState.MOVING_TO_TARGET) {
      continue;
    }

    const isAllied = isAlliedSensorPhalanxContact(diplomacyResolver, viewerPlayerId, fleet.ownerId);
    if (sameCoordinates(fleet.target, target)) {
      contacts.push(toSensorPhalanxFleetContactDto(fleet, 'INCOMING', galaxy.currentTurn, isAllied));
      continue;
    }

    if (sameCoordinates(fleet.origin, target)) {
      contacts.push(toSensorPhalanxFleetContactDto(fleet, 'OUTGOING', galaxy.currentTurn, isAllied));
    }
  }

  contacts.sort(compareSensorPhalanxContacts);

  return {
    capabilities: toSensorPhalanxCapabilitiesDto(originPlanet, origin, galaxy.currentTurn),
    target,
    targetPlanetName: targetPlanet.basicInfo.name,
    contacts
  };
}

function processSensorPhalanxTurnStart(galaxy: Galaxy, currentTurn: number): void {
  const diplomacyResolver = createDiplomacyResolver(galaxy);

  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    for (const planet of player.planets) {
      planet.synchronizeSensorPhalanxTurn(currentTurn);
      const normalRange = planet.getSensorPhalanxNormalRange();
      if (
        planet.getBuildingLevel(BuildingType.SENSOR_PHALANX as BuildingTypeType) <= 0
        || normalRange <= 0
      ) {
        planet.rBDSFTQ.sensorPhalanxKnownIncomingFleetIds = [];
        continue;
      }

      const detections = collectSensorPhalanxPassiveDetections(
        galaxy,
        player.playerId,
        toPlanetCoordinates(planet),
        normalRange,
        diplomacyResolver
      );
      const knownFleetIds = new Set(planet.rBDSFTQ.sensorPhalanxKnownIncomingFleetIds);
      const newDetections = detections.filter((entry) => !knownFleetIds.has(entry.fleetId));

      if (newDetections.length > 0) {
        player.addReport(createSensorPhalanxPassiveReport(player, planet, newDetections, currentTurn));
      }

      planet.rBDSFTQ.sensorPhalanxKnownIncomingFleetIds = detections.map((entry) => entry.fleetId);
    }
  }
}
function createSensorPhalanxPassiveReport(
  player: Player,
  detectorPlanet: Planet,
  detections: SensorPhalanxPassiveDetection[],
  currentTurn: number
): SensorPhalanxReport {
  const sourceCoordinates = toPlanetCoordinates(detectorPlanet);
  const body = detections.map((entry) =>
    `Incoming fleet detected for ${entry.targetPlanetName} (${entry.targetCoordinates.x}:${entry.targetCoordinates.y}:${entry.targetCoordinates.z}) | Size: ${entry.contact.fleetSize} | ETA: ${entry.contact.etaTurns} | Allied: ${entry.contact.isAllied ? 'Yes' : 'No'}`
  ).join('\n');

  return new SensorPhalanxReportModel(
    {
      reportId: player.createReportId(),
      createdTurn: currentTurn,
      title: `Sensor Phalanx Alert: ${detectorPlanet.basicInfo.name} (${sourceCoordinates.x}:${sourceCoordinates.y}:${sourceCoordinates.z})`,
      sourceCoordinates,
      sourcePlanetName: detectorPlanet.basicInfo.name,
      sourceSystemName: detectorPlanet.basicInfo.solarSystem.name
    },
    body
  );
}

function calculateFuelCost(
  ships: Array<{ type: ShipTypeType; amount: number }>,
  distance: number,
  multiplier = 1
): number {
  let totalFuel = 0;
  for (const ship of ships) {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(ship.type);
    if (!blueprint || !blueprint.canJump) {
      continue;
    }

    totalFuel += blueprint.jumpCost * Math.max(1, distance) * ship.amount;
  }

  return Math.max(0, totalFuel * Math.max(1, multiplier));
}

function sameCoordinates(left: ClientCoordinates, right: ClientCoordinates): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function toCoordinatesId(coordinates: ClientCoordinates): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function multiplyResourcePack(base: ResourcesPackType, amount: number): ResourcesPackType {
  return {
    metal: base.metal * amount,
    crystal: base.crystal * amount,
    deuterium: base.deuterium * amount
  } as ResourcesPackType;
}

function addProducedShipyardUnitsToPlanet(
  planet: Planet,
  blueprint: Ship | Defence,
  itemKind: 'ship' | 'defence',
  amount: number
): void {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  if (normalizedAmount <= 0) {
    return;
  }

  if (itemKind === 'defence') {
    planet.rBDSFTQ.defences.addUndamaged((blueprint as Defence).type, normalizedAmount);
    return;
  }

  planet.rBDSFTQ.ships.addUndamaged((blueprint as Ship).type, normalizedAmount);
}

function toResourcesPackDto(pack: ResourcesPackType): ResourcesPackDto {
  return {
    metal: pack.metal,
    crystal: pack.crystal,
    deuterium: pack.deuterium
  };
}

function toPlanetaryParametersDto(parameters: PlanetaryParameters): PlanetaryParametersDto {
  return {
    metalModifier: parameters.metalModifier,
    crystalModifier: parameters.crystalModifier,
    deuteriumModifier: parameters.deuteriumModifier,
    energyModifierRES: parameters.energyModifierRES,
    energyModifierNuclear: parameters.energyModifierNuclear,
    scienceModifier: parameters.scienceModifier,
    industryModifier: parameters.industryModifier,
    anomaliesAndNoise: parameters.anomaliesAndNoise,
    hyperspaceParameters: parameters.hyperspaceParameters
  };
}

function toBuildingLevelEntries(map: Map<string, number>): BuildingLevelEntry[] {
  const entries: BuildingLevelEntry[] = [];
  for (const [type, level] of map.entries()) {
    entries.push({ type, level } as BuildingLevelEntry);
  }
  return entries;
}

function toBuildingPowerConsumptionEntries(clientPlanet: ClientPlanet): BuildingPowerConsumptionEntry[] {
  const entries: BuildingPowerConsumptionEntry[] = [];
  for (const [type] of clientPlanet.rBDSFTQ.buildingsLevels.entries()) {
    entries.push({
      type: type as BuildingTypeType,
      currentPowerConsumption: clientPlanet.getCurrentBuildingPowerConsumption(type as BuildingTypeType)
    });
  }

  return entries;
}

function toFusionReactorStageEntry(clientPlanet: ClientPlanet): FusionReactorStageEntry | null {
  if (clientPlanet.getMaxFusionReactorStage() <= 0) {
    return null;
  }

  return {
    selectedStage: clientPlanet.getFusionReactorSelectedStage()
  };
}

function toBuildingStructuralPointsEntries(clientPlanet: ClientPlanet): BuildingStructuralPointsEntry[] {
  const entries: BuildingStructuralPointsEntry[] = [];
  for (const [type] of clientPlanet.rBDSFTQ.buildingsLevels.entries()) {
    entries.push({
      type: type as BuildingTypeType,
      currentStructuralPoints: clientPlanet.getCurrentBuildingStructuralPoints(type as BuildingTypeType),
      maxStructuralPoints: clientPlanet.getMaxBuildingStructuralPoints(type as BuildingTypeType)
    });
  }

  return entries;
}

function toTechLevelEntries(map: Map<string, number>): TechLevelEntry[] {
  const entries: TechLevelEntry[] = [];
  for (const [type, level] of map.entries()) {
    entries.push({ type, level } as TechLevelEntry);
  }
  return entries;
}

function toShipAmountEntries(map: Map<unknown, number>): ShipAmountEntry[] {
  const entries: ShipAmountEntry[] = [];
  for (const [type, amount] of map.entries()) {
    entries.push({ type: String(type), amount } as ShipAmountEntry);
  }

  return entries;
}

function toPlayerReportBaseDto(report: PlayerReport): PlayerReportDtoBase {
  return {
    reportId: report.reportId,
    reportType: report.reportType as ReportTypeType,
    createdTurn: report.createdTurn,
    title: report.title,
    isRead: report.isRead,
    sourceCoordinates: report.sourceCoordinates
      ? {
        x: report.sourceCoordinates.x,
        y: report.sourceCoordinates.y,
        z: report.sourceCoordinates.z
      }
      : null,
    sourcePlanetName: report.sourcePlanetName,
    sourceSystemName: report.sourceSystemName,
    senderPlayerName: report.senderPlayerName
  };
}

function toClientReportDataDto(reportData: EspionageReportData): ClientReportDataDto {
  return {
    ...toPlayerReportBaseDto(reportData),
    diff: reportData.diff,
    size: reportData.size,
    planetaryParameters: toPlanetaryParametersDto(reportData.planetaryParameters),
    averageBuildingLevel: reportData.averageBuildingLevel,
    averageTotalResources: reportData.averageTotalResources,
    averageTechLevel: reportData.averageTechLevel,
    totalDefencesAmount: reportData.totalDefencesAmount,
    totalShipsAmount: reportData.totalShipsAmount,
    buildingsLevels: toBuildingLevelEntries(reportData.buildingsLevels),
    resourcesAmount: toResourcesPackDto(reportData.resourcesAmount),
    techLevels: toTechLevelEntries(reportData.techLevels),
    defences: reportData.defences,
    ships: toShipAmountEntries(reportData.ships),
    shipyardProduction: reportData.shipyardProduction,
    defencesProduction: reportData.defencesProduction,
    researchProduction: reportData.researchProduction,
    buildingProduction: reportData.buildingProduction
  };
}

function toTextPlayerReportDto(report: PlayerReport & { body: string }): TextPlayerReportDto {
  return {
    ...toPlayerReportBaseDto(report),
    body: report.body
  };
}

function toEspionagePlayerReportDto(report: EspionageReportData): EspionagePlayerReportDto {
  return {
    ...toPlayerReportBaseDto(report),
    diff: report.diff,
    size: report.size,
    planetaryParameters: toPlanetaryParametersDto(report.planetaryParameters),
    averageBuildingLevel: report.averageBuildingLevel,
    averageTotalResources: report.averageTotalResources,
    averageTechLevel: report.averageTechLevel,
    totalDefencesAmount: report.totalDefencesAmount,
    totalShipsAmount: report.totalShipsAmount,
    buildingsLevels: toBuildingLevelEntries(report.buildingsLevels),
    resourcesAmount: toResourcesPackDto(report.resourcesAmount),
    techLevels: toTechLevelEntries(report.techLevels),
    defences: report.defences,
    ships: toShipAmountEntries(report.ships),
    shipyardProduction: report.shipyardProduction,
    defencesProduction: report.defencesProduction,
    researchProduction: report.researchProduction,
    buildingProduction: report.buildingProduction
  };
}

function toPlayerReportDto(report: PlayerReport): PlayerReportDto {
  switch (report.reportType) {
    case ReportType.ESPIONAGE_REPORT:
      return toEspionagePlayerReportDto(report as EspionageReportData);
    default:
      return toTextPlayerReportDto(report as PlayerReport & { body: string });
  }
}

function toClientPlanetDto(clientPlanet: ClientPlanet, coordinates: ClientCoordinates): ClientPlanetDto {
  clientPlanet.normalizeBuildingQueueProgress();
  return {
    coordinates,
    basicInfo: {
      name: clientPlanet.basicInfo.name,
      type: clientPlanet.basicInfo.type,
      colonizationDifficulty: clientPlanet.basicInfo.colonizationDifficulty,
      order: clientPlanet.basicInfo.order,
      image: clientPlanet.basicInfo.image,
      size: clientPlanet.basicInfo.size
    },
    info: {
      isOwnedByViewer: clientPlanet.isOwnedByViewer,
      ownerId: clientPlanet.info.ownerId,
      ownerPlayerType: clientPlanet.ownerPlayerType,
      ownerPlayerName: clientPlanet.ownerPlayerName,
      planetaryParameters: toPlanetaryParametersDto(clientPlanet.info.planetaryParameters)
    },
    objects: {
      resources: toResourcesPackDto(clientPlanet.rBDSFTQ.resources),
      buildingsLevels: toBuildingLevelEntries(clientPlanet.rBDSFTQ.buildingsLevels),
      buildingsCurrentPowerConsumption: toBuildingPowerConsumptionEntries(clientPlanet),
      fusionReactorStage: toFusionReactorStageEntry(clientPlanet),
      buildingsCurrentStructuralPoints: toBuildingStructuralPointsEntries(clientPlanet),
      defences: clientPlanet.rBDSFTQ.defences,
      ships: clientPlanet.rBDSFTQ.ships,
      currentResearchQueue: clientPlanet.rBDSFTQ.currentResearchQueue,
      researchHelperFor: clientPlanet.rBDSFTQ.researchHelperFor,
      buildingQueue: clientPlanet.rBDSFTQ.buildingQueue,
      shipyardQueue: clientPlanet.rBDSFTQ.shipyardQueue,
      fleets: clientPlanet.rBDSFTQ.fleets,
      spaceDebris: toResourcesPackDto(clientPlanet.rBDSFTQ.spaceDebris),
      tradePortOffers: toTradePortOfferDtos(clientPlanet.rBDSFTQ.tradePortOffers)
    },
    reportData: clientPlanet.reportData ? toClientReportDataDto(clientPlanet.reportData) : null
  };
}

function toClientPlanetDtoFromClientPlanet(clientPlanet: ClientPlanet): ClientPlanetDto {
  const systemCoordinates = clientPlanet.basicInfo.solarSystem.coordinates;
  const z = Math.max(0, clientPlanet.basicInfo.order - 1);
  return toClientPlanetDto(clientPlanet, {
    x: systemCoordinates.x,
    y: systemCoordinates.y,
    z
  });
}

function toTradePortOfferDtos(offers: TradePortOffer[]): TradePortOfferDto[] {
  return offers.map((offer) => ({
    offerId: offer.offerId,
    turn: offer.turn,
    getResourceType: offer.getResourceType,
    getAmount: offer.getAmount,
    costResourceType: offer.costResourceType,
    baseCost: offer.baseCost,
    totalCost: offer.totalCost,
    rolledModifierPercent: offer.rolledModifierPercent,
    levelDiscountPercent: offer.levelDiscountPercent,
    costModifierPercent: offer.costModifierPercent,
    used: offer.used
  }));
}

function buildPresentationDataByPlayer(galaxy: Galaxy): Map<number, GalaxyPresentationDataType> {
  const map = new Map<number, GalaxyPresentationDataType>();
  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    map.set(player.playerId, GalaxyPresentationData.fromGalaxy(galaxy, player.playerId));
  }
  return map;
}

function getPresentationData(galaxy: Galaxy, playerId: number): GalaxyPresentationDataType {
  const cached = currentGalaxyPresentationByPlayer.get(playerId);
  if (cached) {
    return cached;
  }

  const computed = GalaxyPresentationData.fromGalaxy(galaxy, playerId);
  currentGalaxyPresentationByPlayer.set(playerId, computed);
  return computed;
}

function generateSelfReportsForHumanPlayers(galaxy: Galaxy, turnNumber: number): void {
  const reportGenerator = new EspionageReportGenerator();
  const playersById = new Map<number, (typeof galaxy.players)[number]>();
  for (const entry of galaxy.players) {
    playersById.set(entry.playerId, entry);
  }

  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    for (const row of galaxy.stars) {
      for (const system of row) {
        for (const planet of system.planets) {
          if (planet.info.ownerId !== player.playerId) {
            continue;
          }

          const report = reportGenerator.createEspionageReport(
            player,
            player,
            planet,
            0,
            {
              reportId: player.createReportId(),
              forcedReportLevel: SELF_REPORT_LEVEL,
              createdTurn: turnNumber
            }
          );
          planet.lastReportData.set(player.playerId, report.copy());
          player.addReport(report.copy());
        }
      }
    }

    const homePlanet = player.planets[0];
    const startingSystem = homePlanet?.basicInfo.solarSystem;
    if (!homePlanet || !startingSystem) {
      continue;
    }

    for (const planet of startingSystem.planets) {
      if (planet === homePlanet || planet.lastReportData.has(player.playerId)) {
        continue;
      }

      const ownerId = planet.info.ownerId;
      const planetOwner = ownerId === null ? null : playersById.get(ownerId) ?? null;
      const report = reportGenerator.createEspionageReport(
        player,
        planetOwner,
        planet,
        0,
        {
          reportId: player.createReportId(),
          forcedReportLevel: STARTING_SYSTEM_REPORT_LEVEL,
          createdTurn: turnNumber
        }
      );
      planet.lastReportData.set(player.playerId, report.copy());
      player.addReport(report.copy());
    }
  }
}

function refreshOwnedPlanetSelfReportsForHumanPlayers(galaxy: Galaxy, turnNumber: number): void {
  const reportGenerator = new EspionageReportGenerator();

  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    for (const planet of player.planets) {
      const report = reportGenerator.createEspionageReport(
        player,
        player,
        planet,
        0,
        {
          reportId: player.createReportId(),
          forcedReportLevel: SELF_REPORT_LEVEL,
          createdTurn: turnNumber
        }
      );
      planet.lastReportData.set(player.playerId, report.copy());
    }
  }
}

function refreshPlanetIntelForPlayer(
  viewer: Player,
  planetOwner: Player | null,
  planet: Planet,
  turnNumber: number
): void {
  const reportGenerator = new EspionageReportGenerator();
  const report = reportGenerator.createEspionageReport(
    viewer,
    planetOwner,
    planet,
    0,
    {
      reportId: viewer.createReportId(),
      forcedReportLevel: SELF_REPORT_LEVEL,
      createdTurn: turnNumber
    }
  );
  planet.lastReportData.set(viewer.playerId, report.copy());
}

function toGalaxyByteCellDto(cell: GalaxyByteCell): GalaxyByteCellDto {
  return {
    planetsAndAsteroids: [cell.planetsAndAsteroids[0], cell.planetsAndAsteroids[1]]
  };
}

function toOwnershipByteCellDto(cell: OwnershipByteCell | null): OwnershipByteCellDto | null {
  if (!cell) {
    return null;
  }

  return {
    ownership: [cell.ownership[0], cell.ownership[1], cell.ownership[2], cell.ownership[3]]
  };
}

function toStarSystemNoteDto(note: StarSystemNoteType): StarSystemNoteDto {
  return {
    coordinates: {
      x: note.coordinates.x,
      y: note.coordinates.y
    },
    borderColor: note.borderColor,
    text: note.text
  };
}

function toGalaxyPresentationDataDto(
  data: GalaxyPresentationDataType,
  starSystemNotes: StarSystemNoteType[]
): GalaxyPresentationDataDto {
  return {
    galaxyBytes: data.galaxyBytes.map((row) => row.map((cell) => toGalaxyByteCellDto(cell))),
    ownershipBytes: data.ownershipBytes.map((row) =>
      row.map((cell) => toOwnershipByteCellDto(cell))
    ),
    ownedPlanets: data.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet)),
    ownFleetMovements: data.ownFleetMovements.map((movement) => toGalaxyOwnFleetMovementDto(movement)),
    starSystemNotes: starSystemNotes.map((note) => toStarSystemNoteDto(note))
  };
}

function toGalaxyOwnFleetMovementDto(movement: FleetMovementSummary): GalaxyPresentationDataDto['ownFleetMovements'][number] {
  return {
    fleetId: movement.fleetId,
    missionType: movement.missionType,
    state: movement.state,
    routeKind: movement.routeKind,
    originSystemCoordinates: { ...movement.originSystemCoordinates },
    targetSystemCoordinates: { ...movement.targetSystemCoordinates },
    currentSystemCoordinates: movement.currentSystemCoordinates
      ? { ...movement.currentSystemCoordinates }
      : null,
    shipCount: movement.shipCount,
    etaTurns: movement.etaTurns,
    originPlanetName: movement.originPlanetName,
    targetPlanetName: movement.targetPlanetName
  };
}

function toClientInfoDto(clientInfo: ClientStarSystem['clientInfo']): ClientInfoDto {
  return {
    ownedPlanetCount: clientInfo.ownedPlanetCount,
    neutralPlanetCount: clientInfo.neutralPlanetCount,
    botPlanetCount: clientInfo.botPlanetCount,
    humanPlanetCount: clientInfo.humanPlanetCount
  };
}

function toClientStarSystemDto(system: ClientStarSystem, includePlanets: boolean): ClientStarSystemDto {
  const systemCoordinates: ClientCoordinates = {
    x: system.coordinates.x,
    y: system.coordinates.y,
    z: -1
  };
  const planets = includePlanets
    ? system.planets.map((planet, index) =>
      toClientPlanetDto(planet, {
        x: system.coordinates.x,
        y: system.coordinates.y,
        z: index
      })
    )
    : [];

  return {
    coordinates: systemCoordinates,
    name: system.name,
    isGalaxyCenter: system.isGalaxyCenter,
    isVoid: system.isVoid,
    isCenterEdge: system.isCenterEdge,
    discoveredByPlayer: Array.from(system.discoveredByPlayer),
    planets,
    clientInfo: toClientInfoDto(system.clientInfo)
  };
}

function toPlayerNameEntries(playerNameMap: Map<number, string>): PlayerNameEntry[] {
  const entries: PlayerNameEntry[] = [];
  for (const [playerId, playerName] of playerNameMap.entries()) {
    entries.push({ playerId, playerName });
  }
  return entries;
}

function toClientGalaxyDto(clientGalaxy: ClientGalaxy, includePlanets: boolean): ClientGalaxyDto {
  return {
    name: clientGalaxy.name,
    stars: clientGalaxy.stars.map((row) =>
      row.map((system) => toClientStarSystemDto(system, includePlanets))
    ),
    playerNames: toPlayerNameEntries(clientGalaxy.playerNameMap)
  };
}

function parseBooleanFlag(value: unknown): boolean {
  if (Array.isArray(value)) {
    return parseBooleanFlag(value[0]);
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseIncludePlanets(value: unknown): boolean {
  return parseBooleanFlag(value);
}

function buildGalaxySnapshot(galaxy: Galaxy): GalaxySnapshot {
  return {
    name: galaxy.name,
    currentTurn: galaxy.currentTurn,
    diplomaticRelations: toDiplomaticRelationDtos(galaxy.diplomaticRelations),
    stars: galaxy.stars.map((row) =>
      row.map((system) => ({
        isVoid: system.isVoid,
        isGalaxyCenter: system.isGalaxyCenter,
        coordinates: {
          x: system.coordinates.x,
          y: system.coordinates.y
        }
      }))
    )
  };
}

function toDiplomaticRelationDtos(relations: DiplomaticRelation[]): DiplomaticRelationDto[] {
  return relations.map((relation) => ({
    playerAId: relation.playerAId,
    playerBId: relation.playerBId,
    status: relation.status
  }));
}

function buildDiplomacyViewResponse(galaxy: Galaxy, viewer: Player): DiplomacyViewResponse {
  return {
    currentTurn: galaxy.currentTurn,
    currentPlayerId: viewer.playerId,
    outgoingProposalSentThisTurn: hasOutgoingProposalSentThisTurn(galaxy, viewer.playerId, galaxy.currentTurn),
    ownedPlanets: buildOwnedPlanetsForPlayer(galaxy, viewer.playerId),
    contacts: buildDiplomacyContactDtos(galaxy, viewer),
    activeProposals: buildActiveDiplomaticProposalDtos(galaxy, viewer.playerId)
  };
}

function buildMailViewResponse(galaxy: Galaxy, viewer: Player): MailViewResponse {
  synchronizeJumpGateRequests(galaxy);
  synchronizeMaintenanceRequests(galaxy);
  synchronizeSupportRequests(galaxy);
  const messages = [...viewer.messages]
    .sort((left, right) => right.createdTurn - left.createdTurn || right.messageId - left.messageId)
    .map((message) => toPlayerMailMessageDto(message));
  const requests = buildMailRequestDtos(galaxy, viewer.playerId);
  const recipients = buildMailRecipientDtos(galaxy, viewer.playerId);

  return {
    currentTurn: galaxy.currentTurn,
    currentPlayerId: viewer.playerId,
    unreadMessageCount: countUnreadMailMessagesForPlayer(galaxy, viewer.playerId),
    pendingRequestCount: countPendingMailRequestsForPlayer(galaxy, viewer.playerId),
    messages,
    requests,
    recipients,
    allianceRecipientCount: resolveAllianceMailRecipients(galaxy, viewer.playerId).length
  };
}

function buildDiplomacyContactDtos(galaxy: Galaxy, viewer: Player): DiplomacyContactDto[] {
  const diplomacyResolver = new DiplomacyResolver(galaxy.diplomaticRelations);
  const outgoingProposalSentThisTurn = hasOutgoingProposalSentThisTurn(galaxy, viewer.playerId, galaxy.currentTurn);

  return galaxy.players
    .filter((candidate) => candidate.playerId !== viewer.playerId && candidate.type !== PLAYER_TYPE_NEUTRAL)
    .map((candidate) => {
      const currentStatus = diplomacyResolver.getStatus(viewer.playerId, candidate.playerId);
      const availableStatuses = allowedDiplomaticProposalStatuses(currentStatus);
      const pendingPairProposal = galaxy.diplomaticProposals.some((proposal) =>
        isPendingDiplomaticProposalForPair(proposal, viewer.playerId, candidate.playerId)
      );
      const isReadOnly = availableStatuses.length <= 0;
      const canSendProposal = availableStatuses.length > 0
        && !pendingPairProposal
        && !outgoingProposalSentThisTurn;

      let proposalBlockedReason: string | null = null;
      if (availableStatuses.length <= 0) {
        proposalBlockedReason = 'No diplomacy proposal is available from the current diplomacy status.';
      } else if (pendingPairProposal) {
        proposalBlockedReason = 'A diplomacy proposal for this player pair is already pending.';
      } else if (outgoingProposalSentThisTurn) {
        proposalBlockedReason = 'You have already sent a diplomacy proposal this turn.';
      }

      return {
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        playerType: candidate.type as PlayerTypeType,
        currentStatus,
        isReadOnly,
        canSendMessage: true,
        canSendProposal,
        proposalBlockedReason,
        knownPlanets: buildKnownPlanetsForDiplomacyContact(galaxy, viewer.playerId, candidate.playerId)
      } satisfies DiplomacyContactDto;
    })
    .sort((left, right) => compareDiplomacyContacts(left, right));
}

function buildKnownPlanetsForDiplomacyContact(
  galaxy: Galaxy,
  viewerPlayerId: number,
  targetPlayerId: number
): ClientPlanetDto[] {
  const planets: ClientPlanetDto[] = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== targetPlayerId || !planet.lastReportData.has(viewerPlayerId)) {
          continue;
        }

        const clientPlanet = galaxy.createClientPlanet(planet, viewerPlayerId);
        planets.push(toClientPlanetDtoFromClientPlanet(clientPlanet));
      }
    }
  }

  return planets.sort((left, right) =>
    left.coordinates.x - right.coordinates.x
    || left.coordinates.y - right.coordinates.y
    || left.coordinates.z - right.coordinates.z
  );
}

function buildOwnedPlanetsForPlayer(galaxy: Galaxy, playerId: number): ClientPlanetDto[] {
  const planets: ClientPlanetDto[] = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== playerId) {
          continue;
        }

        planets.push(toClientPlanetDtoFromClientPlanet(galaxy.createClientPlanet(planet, playerId)));
      }
    }
  }

  return planets.sort((left, right) =>
    left.coordinates.x - right.coordinates.x
    || left.coordinates.y - right.coordinates.y
    || left.coordinates.z - right.coordinates.z
  );
}

function buildActiveDiplomaticProposalDtos(
  galaxy: Galaxy,
  viewerPlayerId: number
): DiplomaticProposalDto[] {
  return galaxy.diplomaticProposals
    .filter((proposal) => proposal.state === DiplomaticProposalState.PENDING)
    .filter((proposal) => proposal.fromPlayerId === viewerPlayerId || proposal.toPlayerId === viewerPlayerId)
    .map((proposal) => toDiplomaticProposalDto(galaxy, proposal, viewerPlayerId))
    .sort((left, right) =>
      proposalDirectionOrder(left.direction) - proposalDirectionOrder(right.direction)
      || right.createdTurn - left.createdTurn
      || right.proposalId - left.proposalId
    );
}

function buildMailRequestDtos(
  galaxy: Galaxy,
  viewerPlayerId: number
): MailRequestDto[] {
  const diplomacyRequests = galaxy.diplomaticProposals
    .filter((proposal) => proposal.fromPlayerId === viewerPlayerId || proposal.toPlayerId === viewerPlayerId)
    .map((proposal) => toDiplomacyMailRequestDto(galaxy, proposal, viewerPlayerId));
  const jumpGateRequests = galaxy.jumpGateRequests
    .filter((request) => request.fromPlayerId === viewerPlayerId || request.toPlayerId === viewerPlayerId)
    .map((request) => toJumpGateMailRequestDto(galaxy, request, viewerPlayerId));
  const maintenanceRequests = galaxy.maintenanceRequests
    .filter((request) => request.fromPlayerId === viewerPlayerId || request.toPlayerId === viewerPlayerId)
    .map((request) => toMaintenanceMailRequestDto(galaxy, request, viewerPlayerId));
  const supportRequests = galaxy.supportRequests
    .filter((request) => request.fromPlayerId === viewerPlayerId || request.toPlayerId === viewerPlayerId)
    .map((request) => toSupportMailRequestDto(galaxy, request, viewerPlayerId));

  return [...diplomacyRequests, ...jumpGateRequests, ...maintenanceRequests, ...supportRequests]
    .sort((left, right) =>
      mailRequestGroupOrder(left.state) - mailRequestGroupOrder(right.state)
      || proposalDirectionOrder(left.direction) - proposalDirectionOrder(right.direction)
      || right.createdTurn - left.createdTurn
      || right.requestId - left.requestId
    );
}

function toDiplomaticProposalDto(
  galaxy: Galaxy,
  proposal: DiplomaticProposal,
  viewerPlayerId: number
): DiplomaticProposalDto {
  const fromPlayer = resolvePlayerById(galaxy, proposal.fromPlayerId);
  const toPlayer = resolvePlayerById(galaxy, proposal.toPlayerId);

  return {
    proposalId: proposal.proposalId,
    fromPlayerId: proposal.fromPlayerId,
    fromPlayerName: fromPlayer?.playerName ?? `Player ${proposal.fromPlayerId}`,
    toPlayerId: proposal.toPlayerId,
    toPlayerName: toPlayer?.playerName ?? `Player ${proposal.toPlayerId}`,
    requestedStatus: proposal.requestedStatus,
    createdTurn: proposal.createdTurn,
    expiresOnTurn: proposal.expiresOnTurn,
    state: proposal.state,
    direction: proposal.toPlayerId === viewerPlayerId ? 'incoming' : 'outgoing'
  };
}

function toDiplomacyMailRequestDto(
  galaxy: Galaxy,
  proposal: DiplomaticProposal,
  viewerPlayerId: number
): MailRequestDto {
  const dto = toDiplomaticProposalDto(galaxy, proposal, viewerPlayerId);
  const counterpartyPlayerId = dto.direction === 'incoming' ? dto.fromPlayerId : dto.toPlayerId;
  const counterpartyPlayerName = dto.direction === 'incoming' ? dto.fromPlayerName : dto.toPlayerName;

  return {
    requestId: dto.proposalId,
    requestType: 'DIPLOMACY_PROPOSAL',
    createdTurn: dto.createdTurn,
    expiresOnTurn: dto.expiresOnTurn,
    state: dto.state,
    direction: dto.direction,
    counterpartyPlayerId,
    counterpartyPlayerName,
    requestedStatus: dto.requestedStatus
  };
}

function toMaintenanceMailRequestDto(
  galaxy: Galaxy,
  request: MaintenanceRequest,
  viewerPlayerId: number
): MailRequestDto {
  const direction = request.toPlayerId === viewerPlayerId ? 'incoming' : 'outgoing';
  const counterpartyPlayerId = direction === 'incoming' ? request.fromPlayerId : request.toPlayerId;
  const counterpartyPlayerName = resolvePlayerById(galaxy, counterpartyPlayerId)?.playerName ?? `Player ${counterpartyPlayerId}`;

  return {
    requestId: request.requestId,
    requestType: 'MAINTENANCE',
    createdTurn: request.createdTurn,
    expiresOnTurn: request.expiresOnTurn,
    state: request.state,
    direction,
    counterpartyPlayerId,
    counterpartyPlayerName,
    fleetId: request.fleetId,
    targetPlanetName: request.targetPlanetName,
    requested: toMaintenanceTransferPayloadDto(request.requested),
    approved: request.approved ? toMaintenanceTransferPayloadDto(request.approved) : null
  };
}

function toJumpGateMailRequestDto(
  galaxy: Galaxy,
  request: JumpGateRequest,
  viewerPlayerId: number
): JumpGateMailRequestDto {
  const direction = request.toPlayerId === viewerPlayerId ? 'incoming' : 'outgoing';
  const counterpartyPlayerId = direction === 'incoming' ? request.fromPlayerId : request.toPlayerId;
  const counterpartyPlayerName = resolvePlayerById(galaxy, counterpartyPlayerId)?.playerName ?? `Player ${counterpartyPlayerId}`;

  return {
    requestId: request.requestId,
    requestType: 'JUMP_GATE',
    createdTurn: request.createdTurn,
    expiresOnTurn: request.expiresOnTurn,
    state: request.state,
    direction,
    counterpartyPlayerId,
    counterpartyPlayerName,
    fleetId: request.fleetId,
    missionType: request.missionType,
    originPlanetName: request.originPlanetName,
    targetPlanetName: request.targetPlanetName,
    totalShips: request.totalShips
  };
}

function toSupportMailRequestDto(
  galaxy: Galaxy,
  request: SupportRequest,
  viewerPlayerId: number
): SupportMailRequestDto {
  const direction = request.toPlayerId === viewerPlayerId ? 'incoming' : 'outgoing';
  const counterpartyPlayerId = direction === 'incoming' ? request.fromPlayerId : request.toPlayerId;
  const counterpartyPlayerName = resolvePlayerById(galaxy, counterpartyPlayerId)?.playerName ?? `Player ${counterpartyPlayerId}`;

  return {
    requestId: request.requestId,
    requestType: 'SUPPORT',
    supportType: request.supportType,
    createdTurn: request.createdTurn,
    expiresOnTurn: request.expiresOnTurn,
    state: request.state,
    direction,
    counterpartyPlayerId,
    counterpartyPlayerName,
    targetPlanetName: request.targetPlanetName,
    targetCoordinates: { ...request.targetCoordinates },
    acceptedTurn: request.acceptedTurn,
    executionDueTurn: request.executionDueTurn,
    executionExpiresOnTurn: request.executionExpiresOnTurn,
    fulfilledTurn: request.fulfilledTurn,
    resolutionNote: request.resolutionNote,
    requestedResources: 'requestedResources' in request ? toResourcesPackDto(request.requestedResources) : null,
    approvedResources: 'approvedResources' in request && request.approvedResources ? toResourcesPackDto(request.approvedResources) : null,
    reservedSourcePlanetName: 'reservedSourcePlanetName' in request ? request.reservedSourcePlanetName : null,
    reservedSourceCoordinates: 'reservedSourceCoordinates' in request && request.reservedSourceCoordinates
      ? { ...request.reservedSourceCoordinates }
      : null,
    missionType: 'missionType' in request ? request.missionType : null,
    minimumShips: 'minimumShips' in request ? request.minimumShips.map((entry) => ({ ...entry })) : null,
    bombardmentPriorities: 'bombardmentPriorities' in request ? request.bombardmentPriorities : null,
    targetOwnerPlayerName: 'targetOwnerPlayerName' in request ? request.targetOwnerPlayerName : null,
    launchedFleetId: 'launchedFleetId' in request ? request.launchedFleetId : null,
    launchOriginPlanetName: 'launchOriginPlanetName' in request ? request.launchOriginPlanetName : null,
    launchOriginCoordinates: 'launchOriginCoordinates' in request && request.launchOriginCoordinates
      ? { ...request.launchOriginCoordinates }
      : null
  };
}

function buildMailRecipientDtos(
  galaxy: Galaxy,
  viewerPlayerId: number
): MailRecipientDto[] {
  return galaxy.players
    .filter((candidate) => candidate.playerId !== viewerPlayerId)
    .filter((candidate) => candidate.type === PLAYER_TYPE_PLAYER)
    .filter((candidate) => canSendDirectMailToPlayer(galaxy, viewerPlayerId, candidate.playerId))
    .map((candidate) => {
      const currentStatus = resolveDiplomaticStatus(galaxy, viewerPlayerId, candidate.playerId);
      return {
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        playerType: candidate.type as PlayerTypeType,
        currentStatus,
        isAllianceMember: currentStatus === DiplomaticStatus.ALLIED
      } satisfies MailRecipientDto;
    })
    .sort((left, right) =>
      Number(right.isAllianceMember) - Number(left.isAllianceMember)
      || left.playerName.localeCompare(right.playerName)
    );
}

function compareDiplomacyContacts(left: DiplomacyContactDto, right: DiplomacyContactDto): number {
  return diplomacyPlayerTypeOrder(left.playerType) - diplomacyPlayerTypeOrder(right.playerType)
    || left.playerName.localeCompare(right.playerName);
}

function diplomacyPlayerTypeOrder(playerType: PlayerTypeType): number {
  switch (playerType) {
    case 'PLAYER':
      return 0;
    case 'BOT':
      return 1;
    case 'NEUTRAL':
      return 2;
    default:
      return 9;
  }
}

function proposalDirectionOrder(direction: 'incoming' | 'outgoing'): number {
  return direction === 'incoming' ? 0 : 1;
}

function mailRequestGroupOrder(state: DiplomaticProposalStateType): number {
  return state === DiplomaticProposalState.PENDING ? 0 : 1;
}

function countPendingMailRequestsForPlayer(galaxy: Galaxy, playerId: number): number {
  const diplomacyPending = galaxy.diplomaticProposals.filter((proposal) =>
    proposal.state === DiplomaticProposalState.PENDING
    && proposal.toPlayerId === playerId
  ).length;
  const jumpGatePending = galaxy.jumpGateRequests.filter((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.toPlayerId === playerId
  ).length;
  const maintenancePending = galaxy.maintenanceRequests.filter((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.toPlayerId === playerId
  ).length;
  const supportPending = galaxy.supportRequests.filter((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.toPlayerId === playerId
  ).length;

  return diplomacyPending + jumpGatePending + maintenancePending + supportPending;
}

function countUnreadMailMessagesForPlayer(galaxy: Galaxy, playerId: number): number {
  const player = resolvePlayerById(galaxy, playerId);
  return player?.messages.filter((message) => !message.isRead).length ?? 0;
}

function resolveDiplomaticStatus(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number
): DiplomaticStatusType {
  return currentDiplomaticStatusForPair(galaxy, leftPlayerId, rightPlayerId);
}

function canSendDirectMailToPlayer(
  galaxy: Galaxy,
  senderPlayerId: number,
  targetPlayerId: number
): boolean {
  const targetPlayer = resolvePlayerById(galaxy, targetPlayerId);
  return !!targetPlayer
    && targetPlayer.type === PLAYER_TYPE_PLAYER
    && targetPlayer.playerId !== senderPlayerId;
}

function reconcileOfflineBotControlledSeatsForRuntime(
  gameId: string,
  runtime: NonNullable<ReturnType<typeof getGameRuntime>>,
  authData: AuthData
): void {
  const record = getGameById(GAME_REGISTRY_DATA_PATH, gameId);
  if (!record || record.kind !== 'MULTIPLAYER' || record.status !== 'RUNNING') {
    if (runtime.offlineBotControlledPlayerIds.size > 0) {
      updateGameRuntime(gameId, {
        offlineBotControlledPlayerIds: new Set<number>()
      });
    }
    return;
  }

  const result = reconcileOfflineBotControlledSeats(
    runtime.galaxy,
    gameId,
    listMembershipsForGame(GAME_MEMBERSHIPS_DATA_PATH, gameId),
    authData.accounts.map((account) => ({
      id: account.id,
      replaceWithBotOnLogout: account.replaceWithBotOnLogout,
      logoutBotProfileId: account.logoutBotProfileId
    })),
    authData.sessions
      .filter((session) => session.currentGameId === gameId)
      .filter((session) => !!getPresenceForGameAccount(MULTIPLAYER_PRESENCE_DATA_PATH, gameId, session.accountId))
      .map((session) => ({
        accountId: session.accountId,
        currentGameId: session.currentGameId
      })),
    runtime.offlineBotControlledPlayerIds
  );

  if (!result.changed) {
    return;
  }

  const nextPresentation = buildPresentationDataByPlayer(runtime.galaxy);
  const nextReadyPlayerIds = new Set(
    [...runtime.currentTurnReadyPlayerIds].filter((playerId) =>
      !result.offlineBotControlledPlayerIds.has(playerId)
    )
  );

  updateGameRuntime(gameId, {
    galaxy: runtime.galaxy,
    presentationByPlayer: nextPresentation,
    currentTurnReadyPlayerIds: nextReadyPlayerIds,
    offlineBotControlledPlayerIds: result.offlineBotControlledPlayerIds
  });

  if (currentRuntimeGameId === gameId) {
    currentGalaxy = runtime.galaxy;
    currentGalaxyPresentationByPlayer = nextPresentation;
    currentTurnReadyPlayerIds = nextReadyPlayerIds;
  }
}

function addPlayerMessage(
  recipient: Player,
  createdTurn: number,
  title: string,
  body: string,
  senderPlayerId: number | null,
  senderPlayerName: string | null
): void {
  recipient.addMessage(new PlayerMessageModel({
    messageId: recipient.createMessageId(),
    createdTurn,
    title,
    body,
    senderPlayerId,
    senderPlayerName
  }));
}

function resolveAllianceMailRecipients(galaxy: Galaxy, senderPlayerId: number): Player[] {
  return galaxy.players
    .filter((candidate) => candidate.playerId !== senderPlayerId)
    .filter((candidate) => candidate.type === PLAYER_TYPE_PLAYER)
    .filter((candidate) => resolveDiplomaticStatus(galaxy, senderPlayerId, candidate.playerId) === DiplomaticStatus.ALLIED);
}

function normalizeMailRecipientMode(value: unknown): 'player' | 'alliance' | null {
  if (value === 'player' || value === 'alliance') {
    return value;
  }

  return null;
}

function buildEndTurnMailBlockMessage(unreadMailCount: number, pendingRequestCount: number): string {
  const parts: string[] = [];
  if (pendingRequestCount > 0) {
    parts.push(`resolve ${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'}`);
  }
  if (unreadMailCount > 0) {
    parts.push(`read ${unreadMailCount} unread message${unreadMailCount === 1 ? '' : 's'}`);
  }

  return `Open Mail and ${parts.join(' and ')} before ending the turn.`;
}

function toPlayerMailMessageDto(message: PlayerMessage): PlayerMailMessageDto {
  return {
    messageId: message.messageId,
    createdTurn: message.createdTurn,
    title: message.title,
    body: message.body,
    isRead: message.isRead,
    senderPlayerId: message.senderPlayerId,
    senderPlayerName: message.senderPlayerName
  };
}

function toMaintenanceTransferPayloadDto(
  payload: MaintenanceRequest['requested'] | MaintenanceRequest['approved']
): MaintenanceTransferPayloadDto {
  const normalized = normalizeMaintenanceTransferPayload(payload);
  return {
    fuel: normalized.fuel,
    ships: normalized.ships.map((entry) => ({
      type: entry.type,
      amount: entry.amount
    })),
    bombs: normalized.bombs.map((entry) => ({
      type: entry.type,
      amount: entry.amount
    }))
  };
}

function isExplicitMaintenancePayload(value: unknown): value is ResolveMaintenanceRequestRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(value, 'fuel')
    || Object.prototype.hasOwnProperty.call(value, 'ships')
    || Object.prototype.hasOwnProperty.call(value, 'bombs');
}

function buildOwnedActiveFleetsResponse(galaxy: Galaxy, playerId: number): Fleet[] {
  synchronizeJumpGateRequests(galaxy);
  synchronizeMaintenanceRequests(galaxy);
  synchronizeSupportRequests(galaxy);

  return galaxy.activeFleets
    .filter((fleet) => fleet.ownerId === playerId)
    .map((fleet) => annotateFleetRequestMetadata(galaxy, fleet));
}

function annotateFleetRequestMetadata(galaxy: Galaxy, fleet: Fleet): Fleet {
  const pendingMaintenanceRequest = findPendingMaintenanceRequestForFleet(galaxy, fleet.ownerId, fleet.fleetId);
  const pendingJumpGateRequest = findPendingJumpGateRequestForFleet(galaxy, fleet.ownerId, fleet.fleetId);
  fleet.pendingMaintenanceRequestId = pendingMaintenanceRequest?.requestId ?? null;
  fleet.pendingJumpGateRequestId = pendingJumpGateRequest?.requestId ?? null;
  fleet.maintenanceRequestAvailable = canFleetRequestMaintenanceCommand(galaxy, fleet);
  return fleet;
}

function findPendingJumpGateRequestForFleet(
  galaxy: Galaxy,
  ownerId: number,
  fleetId: number
): JumpGateRequest | null {
  return galaxy.jumpGateRequests.find((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.fromPlayerId === ownerId
    && request.fleetId === fleetId
  ) ?? null;
}

function isJumpGateMissionAllowed(missionType: FleetMissionTypeType): boolean {
  return missionType === FleetMissionType.MOVE
    || missionType === FleetMissionType.DEFEND
    || missionType === FleetMissionType.TRANSPORT;
}

function isJumpGateAutoApprovedStatus(status: DiplomaticStatusType): boolean {
  return status === DiplomaticStatus.SELF || status === DiplomaticStatus.PASSIVE;
}

function resolveJumpGateCapacityForPlanet(planet: Planet, owner: Player | null): number {
  const hyperspaceTechnologyLevel = owner?.getTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY as TechnologyTypeType) ?? 0;
  return calculateJumpGateCapacity(
    planet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType),
    planet.info.planetaryParameters.hyperspaceParameters,
    hyperspaceTechnologyLevel,
    planet.getBuildingEffectiveness(BuildingType.JUMP_GATE as BuildingTypeType)
  );
}

function knownJumpGateLevelForViewer(planet: Planet, viewerPlayerId: number): number {
  if (planet.info.ownerId === viewerPlayerId) {
    return planet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType);
  }

  const report = planet.lastReportData.get(viewerPlayerId);
  return report?.buildingsLevels.get(BuildingType.JUMP_GATE as BuildingTypeType) ?? 0;
}

function validateJumpGateLaunchAccess(
  galaxy: Galaxy,
  playerId: number,
  missionType: FleetMissionTypeType,
  originPlanet: Planet,
  targetPlanet: Planet,
  totalSelectedShips: number
): { status: DiplomaticStatusType; targetOwner: Player | null } | { status: number; error: string } {
  if (!isJumpGateMissionAllowed(missionType)) {
    return { status: 400, error: 'Jump Gate is available only for Move, Guard, and Transport.' };
  }

  if (totalSelectedShips <= 0) {
    return { status: 400, error: 'Select at least one ship for Jump Gate travel.' };
  }

  if (originPlanet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType) <= 0) {
    return { status: 409, error: 'Origin planet has no Jump Gate.' };
  }

  const knownTargetJumpGateLevel = knownJumpGateLevelForViewer(targetPlanet, playerId);
  if (knownTargetJumpGateLevel <= 0) {
    return { status: 409, error: 'Target Jump Gate is not known or not available.' };
  }

  if (targetPlanet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType) <= 0) {
    return { status: 409, error: 'Target Jump Gate is not operational.' };
  }

  const originOwner = resolvePlayerById(galaxy, originPlanet.info.ownerId ?? playerId);
  const originCapacity = resolveJumpGateCapacityForPlanet(originPlanet, originOwner);
  if (originCapacity < totalSelectedShips) {
    return { status: 409, error: `Origin Jump Gate capacity is too low for ${totalSelectedShips} ships.` };
  }

  const targetOwner = targetPlanet.info.ownerId === null
    ? null
    : resolvePlayerById(galaxy, targetPlanet.info.ownerId);
  const targetStatus = targetOwner
    ? resolveDiplomaticStatus(galaxy, playerId, targetOwner.playerId)
    : DiplomaticStatus.SELF;
  const targetCapacity = resolveJumpGateCapacityForPlanet(targetPlanet, targetOwner);
  if (targetCapacity < totalSelectedShips) {
    return { status: 409, error: `Target Jump Gate capacity is too low for ${totalSelectedShips} ships.` };
  }

  return {
    status: targetStatus,
    targetOwner
  };
}

function createJumpGatePendingRequest(
  galaxy: Galaxy,
  fleet: Fleet,
  targetOwner: Player,
  totalShips: number
): JumpGateRequest {
  const request = createJumpGateRequest(
    galaxy.nextJumpGateRequestId,
    fleet.fleetId,
    fleet.ownerId,
    targetOwner.playerId,
    fleet.originPlanetName,
    fleet.origin,
    fleet.targetPlanetName,
    fleet.target,
    fleet.missionType,
    totalShips,
    galaxy.currentTurn,
    galaxy.currentTurn
  );
  galaxy.nextJumpGateRequestId += 1;
  galaxy.jumpGateRequests.push(request);
  fleet.pendingJumpGateRequestId = request.requestId;
  return request;
}

function dispatchJumpGateFleet(
  galaxy: Galaxy,
  fleet: Fleet
): void {
  fleet.state = FleetState.MOVING_TO_TARGET;
  fleet.createdAtTurn = galaxy.currentTurn;
  fleet.travelTurns = 1;
  fleet.returnTurns = 1;
  fleet.pendingJumpGateRequestId = null;
  fleet.usesJumpGate = true;
}

function restorePendingJumpGateFleetToOrigin(
  galaxy: Galaxy,
  fleet: Fleet,
  restoreFuelReserve: boolean
): void {
  fleet.pendingJumpGateRequestId = null;
  fleet.usesJumpGate = false;

  const originPlanet = resolvePlanetAtCoordinates(galaxy, fleet.origin);
  if (!originPlanet || originPlanet.info.ownerId !== fleet.ownerId) {
    fleet.state = FleetState.ORBITING;
    fleet.missionType = FleetMissionType.HOLD;
    fleet.orbitActivity = FleetOrbitActivity.PASSIVE_HOLD;
    fleet.suspendedMissionType = null;
    fleet.target = fleet.origin;
    fleet.targetPlanetName = fleet.originPlanetName;
    fleet.createdAtTurn = galaxy.currentTurn;
    fleet.returnReason = FleetReturnReason.NORMAL;
    return;
  }

  originPlanet.rBDSFTQ.ships.addManyShips(fleet.ships);
  originPlanet.rBDSFTQ.defences.addManyDefences(fleet.carriedBombs);
  originPlanet.rBDSFTQ.resources.addResourcePack(new ResourcesPack(
    fleet.cargo.metal,
    fleet.cargo.crystal,
    fleet.cargo.deuterium + (restoreFuelReserve ? fleet.fuelCost : 0)
  ));
  galaxy.activeFleets = galaxy.activeFleets.filter((entry) => entry.fleetId !== fleet.fleetId);
}

function approveJumpGateRequest(
  galaxy: Galaxy,
  request: JumpGateRequest
): { ok: true } | { status: number; error: string } {
  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
  if (!fleet) {
    return { status: 404, error: 'Requesting fleet is no longer available.' };
  }

  if (fleet.state !== FleetState.PENDING_JUMP_GATE) {
    return { status: 409, error: 'Fleet is no longer waiting for Jump Gate approval.' };
  }

  const originPlanet = resolvePlanetAtCoordinates(galaxy, fleet.origin);
  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  if (!originPlanet || originPlanet.info.ownerId !== request.fromPlayerId) {
    return { status: 409, error: 'Origin planet is no longer valid for this Jump Gate request.' };
  }

  if (!targetPlanet || targetPlanet.info.ownerId !== request.toPlayerId) {
    return { status: 409, error: 'Target planet is no longer valid for this Jump Gate request.' };
  }

  const access = validateJumpGateLaunchAccess(
    galaxy,
    request.fromPlayerId,
    fleet.missionType,
    originPlanet,
    targetPlanet,
    request.totalShips
  );
  if ('error' in access) {
    return access;
  }

  request.state = DiplomaticProposalState.ACCEPTED;
  dispatchJumpGateFleet(galaxy, fleet);
  return { ok: true };
}

function rejectJumpGateRequest(
  galaxy: Galaxy,
  request: JumpGateRequest,
  state: DiplomaticProposalStateType
): void {
  request.state = state;
  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
  if (!fleet) {
    return;
  }

  restorePendingJumpGateFleetToOrigin(galaxy, fleet, true);
}

function synchronizeJumpGateRequests(galaxy: Galaxy): void {
  for (const request of galaxy.jumpGateRequests) {
    if (request.state !== DiplomaticProposalState.PENDING) {
      continue;
    }

    const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
    const originPlanet = resolvePlanetAtCoordinates(galaxy, request.originCoordinates);
    const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
    if (
      !fleet
      || fleet.state !== FleetState.PENDING_JUMP_GATE
      || fleet.pendingJumpGateRequestId !== request.requestId
      || !originPlanet
      || originPlanet.info.ownerId !== request.fromPlayerId
      || !targetPlanet
      || targetPlanet.info.ownerId !== request.toPlayerId
    ) {
      request.state = DiplomaticProposalState.CANCELLED;
      if (fleet) {
        restorePendingJumpGateFleetToOrigin(galaxy, fleet, true);
      }
    }
  }
}

function canFleetRequestMaintenance(galaxy: Galaxy, fleet: Fleet): boolean {
  if (fleet.state !== FleetState.ORBITING) {
    return false;
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, fleet.target);
  if (!targetPlanet || targetPlanet.info.ownerId === null) {
    return false;
  }

  const status = resolveDiplomaticStatus(galaxy, fleet.ownerId, targetPlanet.info.ownerId);
  if (!isMaintenanceStatusAllowed(status)) {
    return false;
  }

  if (findPendingMaintenanceRequestForFleet(galaxy, fleet.ownerId, fleet.fleetId)) {
    return false;
  }

  if (fleet.lastMaintenanceRequestTurn === galaxy.currentTurn) {
    return false;
  }

  const fuelCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue1(BuildingType.ALLIANCE_DEPOT as BuildingTypeType)));
  const supportCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue2(BuildingType.ALLIANCE_DEPOT as BuildingTypeType)));
  return fuelCap > 0 || supportCap > 0;
}

function resolveMaintenanceOptionsForFleet(
  galaxy: Galaxy,
  requesterPlayerId: number,
  fleetId: number
):
  | { options: FleetMaintenanceOptionsDto }
  | { status: number; error: string } {
  const context = resolveMaintenanceContextForFleet(galaxy, requesterPlayerId, fleetId);
  if ('error' in context) {
    return context;
  }

  return {
    options: buildMaintenanceOptionsDto(context)
  };
}

function resolveMaintenanceContextForFleet(
  galaxy: Galaxy,
  requesterPlayerId: number,
  fleetId: number
):
  | {
    fleet: Fleet;
    targetPlanet: Planet;
    targetOwner: Player;
    status: DiplomaticStatusType;
    autoApprove: boolean;
    fuelCap: number;
    supportCap: number;
  }
  | { status: number; error: string } {
  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === fleetId && entry.ownerId === requesterPlayerId);
  if (!fleet) {
    return { status: 404, error: 'Fleet not found.' };
  }

  if (fleet.state !== FleetState.ORBITING) {
    return { status: 409, error: 'Maintenance can be requested only by orbiting fleets.' };
  }

  if (findPendingMaintenanceRequestForFleet(galaxy, requesterPlayerId, fleetId)) {
    return { status: 409, error: 'This fleet already has a pending maintenance request.' };
  }

  if (fleet.lastMaintenanceRequestTurn === galaxy.currentTurn) {
    return { status: 409, error: 'This fleet has already requested maintenance this turn.' };
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, fleet.target);
  if (!targetPlanet) {
    return { status: 404, error: 'Maintenance target planet not found.' };
  }

  if (targetPlanet.info.ownerId === null) {
    return { status: 409, error: 'Maintenance requires a planet owner with an Alliance Depot.' };
  }

  const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
  if (!targetOwner) {
    return { status: 404, error: 'Maintenance target owner not found.' };
  }

  const status = resolveDiplomaticStatus(galaxy, requesterPlayerId, targetOwner.playerId);
  if (!isMaintenanceStatusAllowed(status)) {
    return { status: 403, error: 'Maintenance is allowed only on non-hostile planets.' };
  }

  const fuelCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue1(BuildingType.ALLIANCE_DEPOT as BuildingTypeType)));
  const supportCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue2(BuildingType.ALLIANCE_DEPOT as BuildingTypeType)));
  if (fuelCap <= 0 && supportCap <= 0) {
    return { status: 409, error: 'Alliance Depot is not operational on this planet.' };
  }

  return {
    fleet,
    targetPlanet,
    targetOwner,
    status,
    autoApprove: status === DiplomaticStatus.SELF || status === DiplomaticStatus.PASSIVE,
    fuelCap,
    supportCap
  };
}

function createMaintenanceRequestForFleet(
  galaxy: Galaxy,
  requesterPlayerId: number,
  fleetId: number,
  payload: MaintenanceTransferPayloadDto
):
  | { mode: CreateMaintenanceRequestResponse['mode']; message: string }
  | { status: number; error: string } {
  const context = resolveMaintenanceContextForFleet(galaxy, requesterPlayerId, fleetId);
  if ('error' in context) {
    return context;
  }

  const requested = normalizeMaintenanceTransferPayload(payload);
  if (!maintenancePayloadHasAnySelection(requested)) {
    return { status: 400, error: 'Select fuel, bombs, or small ships to request.' };
  }

  const requestValidation = validateRequestedMaintenancePayload(context, requested);
  if (requestValidation) {
    return requestValidation;
  }

  context.fleet.lastMaintenanceRequestTurn = galaxy.currentTurn;

  if (context.autoApprove) {
    const approved = applyMaintenanceTransfer(context.fleet, context.targetPlanet, requested);
    const summary = summarizeMaintenanceTransfer(approved);
    addMaintenanceResolutionReports(
      galaxy,
      context.fleet,
      context.targetPlanet,
      context.targetOwner,
      'Maintenance delivered',
      `Alliance Depot delivered ${summary}.`,
      `Alliance Depot delivered ${summary} to Fleet #${context.fleet.fleetId}.`
    );
    return {
      mode: 'AUTO_APPROVED',
      message: `Maintenance delivered immediately: ${summary}.`
    };
  }

  const maintenanceRequest = createMaintenanceRequest(
    galaxy.nextMaintenanceRequestId,
    context.fleet.fleetId,
    requesterPlayerId,
    context.targetOwner.playerId,
    context.targetPlanet.basicInfo.name,
    context.fleet.target,
    galaxy.currentTurn,
    galaxy.currentTurn + 1,
    requested
  );
  galaxy.nextMaintenanceRequestId += 1;
  galaxy.maintenanceRequests.push(maintenanceRequest);
  context.fleet.pendingMaintenanceRequestId = maintenanceRequest.requestId;

  return {
    mode: 'PENDING',
    message: 'Maintenance request sent.'
  };
}

function approveMaintenanceRequestForFleet(
  galaxy: Galaxy,
  request: MaintenanceRequest,
  requestedApprovalOverride: ResolveMaintenanceRequestRequest | null
): { ok: true } | { status: number; error: string } {
  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
  if (!fleet) {
    return { status: 404, error: 'Requesting fleet is no longer available.' };
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  if (!targetPlanet || targetPlanet.info.ownerId !== request.toPlayerId) {
    return { status: 409, error: 'Maintenance target is no longer valid.' };
  }

  const desiredApproval = requestedApprovalOverride
    ? clampMaintenancePayloadToRequested(requestedApprovalOverride, request.requested)
    : request.requested;
  const approved = applyMaintenanceTransfer(fleet, targetPlanet, desiredApproval);
  request.approved = approved;
  request.state = DiplomaticProposalState.ACCEPTED;
  fleet.pendingMaintenanceRequestId = null;

  const targetOwner = resolvePlayerById(galaxy, request.toPlayerId);
  if (targetOwner) {
    const summary = summarizeMaintenanceTransfer(approved);
    addMaintenanceResolutionReports(
      galaxy,
      fleet,
      targetPlanet,
      targetOwner,
      'Maintenance approved',
      `Your maintenance request was approved. Delivered: ${summary}.`,
      `You approved maintenance for Fleet #${fleet.fleetId}. Delivered: ${summary}.`
    );
  }

  return { ok: true };
}

function rejectMaintenanceRequest(
  galaxy: Galaxy,
  request: MaintenanceRequest,
  requesterBody: string,
  ownerBody: string
): void {
  request.state = DiplomaticProposalState.REJECTED;
  request.approved = normalizeMaintenanceTransferPayload(null);
  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
  if (fleet) {
    fleet.pendingMaintenanceRequestId = null;
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  const targetOwner = resolvePlayerById(galaxy, request.toPlayerId);
  if (!targetPlanet || !targetOwner || !fleet) {
    return;
  }

  addMaintenanceResolutionReports(
    galaxy,
    fleet,
    targetPlanet,
    targetOwner,
    'Maintenance rejected',
    requesterBody,
    ownerBody
  );
}

function cancelMaintenanceRequest(
  galaxy: Galaxy,
  request: MaintenanceRequest,
  requesterBody: string,
  ownerBody: string
): void {
  request.state = DiplomaticProposalState.CANCELLED;
  request.approved = normalizeMaintenanceTransferPayload(null);
  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
  if (fleet) {
    fleet.pendingMaintenanceRequestId = null;
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  const targetOwner = resolvePlayerById(galaxy, request.toPlayerId);
  if (!targetPlanet || !targetOwner || !fleet) {
    return;
  }

  addMaintenanceResolutionReports(
    galaxy,
    fleet,
    targetPlanet,
    targetOwner,
    'Maintenance cancelled',
    requesterBody,
    ownerBody
  );
}

function synchronizeMaintenanceRequests(galaxy: Galaxy): void {
  for (const request of galaxy.maintenanceRequests) {
    if (request.state !== DiplomaticProposalState.PENDING) {
      continue;
    }

    const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
    const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
    if (
      !fleet
      || fleet.state !== FleetState.ORBITING
      || !sameCoordinates(fleet.target, request.targetCoordinates)
      || !targetPlanet
      || targetPlanet.info.ownerId !== request.toPlayerId
    ) {
      request.state = DiplomaticProposalState.CANCELLED;
      request.approved = normalizeMaintenanceTransferPayload(null);
      if (fleet) {
        fleet.pendingMaintenanceRequestId = null;
      }
      const targetOwner = resolvePlayerById(galaxy, request.toPlayerId);
      if (fleet && targetPlanet && targetOwner) {
        addMaintenanceResolutionReports(
          galaxy,
          fleet,
          targetPlanet,
          targetOwner,
          'Maintenance auto-cancelled',
          'Your maintenance request was cancelled because the fleet left orbit or the target changed.',
          `Fleet #${fleet.fleetId} left orbit or changed target before maintenance could be resolved.`
        );
      }
      continue;
    }

    if (request.expiresOnTurn <= galaxy.currentTurn) {
      request.state = DiplomaticProposalState.EXPIRED;
      request.approved = normalizeMaintenanceTransferPayload(null);
      fleet.pendingMaintenanceRequestId = null;
      const targetOwner = resolvePlayerById(galaxy, request.toPlayerId);
      if (!targetOwner) {
        continue;
      }

      addMaintenanceResolutionReports(
        galaxy,
        fleet,
        targetPlanet,
        targetOwner,
        'Maintenance expired',
        'Your maintenance request expired before it was answered.',
        `Maintenance request for Fleet #${fleet.fleetId} expired.`
      );
    }
  }
}

function createSupportRequestCommand(
  galaxy: Galaxy,
  requesterPlayerId: number,
  targetPlayerId: number,
  supportType: SupportRequestTypeDto,
  targetCoordinates: ClientCoordinates,
  requestedResources: ResourcesPackType,
  missionType: FleetMissionTypeType | null,
  minimumShips: ShipAmountEntry[],
  bombardmentPriorities: BombardmentPrioritiesType | null
): { ok: true } | { status: number; error: string } {
  const normalizedMinimumShips = normalizeSupportShipAmounts(minimumShips);
  if (requesterPlayerId === targetPlayerId) {
    return { status: 400, error: 'Support requests cannot target yourself.' };
  }

  const targetPlayer = resolvePlayerById(galaxy, targetPlayerId);
  if (!targetPlayer || targetPlayer.type === PLAYER_TYPE_NEUTRAL) {
    return { status: 404, error: 'Support target not found.' };
  }

  const status = resolveDiplomaticStatus(galaxy, requesterPlayerId, targetPlayerId);
  if (!isSupportRequestAllowedForStatus(supportType, status)) {
    return { status: 403, error: 'Current diplomacy status does not allow this support request.' };
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, targetCoordinates);
  if (!targetPlanet) {
    return { status: 404, error: 'Support target planet not found.' };
  }

  if (supportType === 'RESOURCE_SUPPORT' || supportType === 'PLANET_REPAIR' || supportType === 'PLANET_DEFENSE') {
    if (targetPlanet.info.ownerId !== requesterPlayerId) {
      return { status: 409, error: 'Support requests must target one of your own planets.' };
    }
  } else {
    if (!isKnownHostileSupportTarget(galaxy, requesterPlayerId, targetPlanet, supportType)) {
      return { status: 409, error: 'Offensive support requests require a known hostile target planet.' };
    }

    if (!isOffensiveSupportMissionTypeValid(supportType, missionType)) {
      return { status: 400, error: 'Offensive support request mission type is invalid.' };
    }

    if (!supportShipAmountsHaveAnyValue(normalizedMinimumShips)) {
      return { status: 400, error: 'Select at least one minimum ship requirement.' };
    }

    if (supportType === 'ATTACK_TARGET' && bombardmentPriorities !== null) {
      return { status: 400, error: 'Bombardment priorities are valid only for bombard and siege support requests.' };
    }

    const targetOwnerId = targetPlanet.info.ownerId;
    if (targetOwnerId === null || !isSupportMissionLegalForProvider(galaxy, targetPlayerId, targetOwnerId, supportType)) {
      return { status: 409, error: 'Requested offensive target is not currently valid for the selected ally.' };
    }
  }

  if (supportType === 'RESOURCE_SUPPORT' && !supportResourcesHasAnyValue(requestedResources)) {
    return { status: 400, error: 'Select at least one requested resource amount.' };
  }

  const duplicatePending = galaxy.supportRequests.some((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.fromPlayerId === requesterPlayerId
    && request.toPlayerId === targetPlayerId
    && request.supportType === supportType
    && sameCoordinates(request.targetCoordinates, targetCoordinates)
  );
  if (duplicatePending) {
    return { status: 409, error: 'A matching support request is already pending for this planet.' };
  }

  galaxy.supportRequests.push(createSupportRequest(
    galaxy.nextSupportRequestId,
    requesterPlayerId,
    targetPlayerId,
    supportType,
    targetPlanet.basicInfo.name,
    targetCoordinates,
    galaxy.currentTurn,
    galaxy.currentTurn + 2,
    supportType === 'RESOURCE_SUPPORT' ? requestedResources : null,
    isOffensiveSupportRequestType(supportType)
      ? {
        missionType,
        minimumShips: normalizedMinimumShips,
        bombardmentPriorities,
        targetOwnerPlayerId: targetPlanet.info.ownerId,
        targetOwnerPlayerName: targetPlanet.info.ownerId !== null
          ? resolvePlayerById(galaxy, targetPlanet.info.ownerId)?.playerName ?? null
          : null
      }
      : undefined
  ));
  galaxy.nextSupportRequestId += 1;
  return { ok: true };
}

function approveSupportRequest(
  galaxy: Galaxy,
  request: SupportRequest,
  requestedApproval: ResourcesPackType
): { ok: true } | { status: number; error: string } {
  if (request.supportType === 'RESOURCE_SUPPORT') {
    const approval = supportResourcesHasAnyValue(requestedApproval)
      ? clampSupportResourcesToRequested(requestedApproval, request.requestedResources)
      : request.requestedResources;
    if (!supportResourcesHasAnyValue(approval)) {
      return { status: 400, error: 'Approved support must include at least one resource.' };
    }

    const sourcePlanet = resolveBestResourceSupportSourcePlanet(galaxy, request.toPlayerId, approval);
    if (!sourcePlanet) {
      return { status: 409, error: 'No owned planet currently has enough resources to reserve this support.' };
    }

    sourcePlanet.rBDSFTQ.resources.subtractResourcePack(approval);
    request.approvedResources = approval;
    request.reservedSourcePlanetName = sourcePlanet.basicInfo.name;
    request.reservedSourceCoordinates = toPlanetCoordinates(sourcePlanet);
    request.acceptedTurn = galaxy.currentTurn;
    request.executionDueTurn = galaxy.currentTurn + 1;
    request.executionExpiresOnTurn = galaxy.currentTurn + 1;
    request.state = DiplomaticProposalState.ACCEPTED;
    request.resolutionNote = `Reserved on ${sourcePlanet.basicInfo.name}. Delivery scheduled for turn ${request.executionDueTurn}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      `Resource support accepted`,
      `${resolvePlayerById(galaxy, request.toPlayerId)?.playerName ?? 'Support provider'} reserved ${formatResourcesPackInline(approval)} for ${request.targetPlanetName}. Delivery is scheduled for turn ${request.executionDueTurn}.`,
      `You reserved ${formatResourcesPackInline(approval)} for delivery to ${request.targetPlanetName} on turn ${request.executionDueTurn}.`
    );
    return { ok: true };
  }

  if (isOffensiveSupportRequest(request)) {
    if (!isOffensiveSupportTargetStillValid(galaxy, request)) {
      return { status: 409, error: 'Offensive support target is no longer valid.' };
    }

    request.acceptedTurn = galaxy.currentTurn;
    request.executionDueTurn = galaxy.currentTurn + 1;
    request.executionExpiresOnTurn = galaxy.currentTurn + 5;
    request.state = DiplomaticProposalState.ACCEPTED;
    request.resolutionNote = `Offensive support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Offensive support accepted',
      `${resolvePlayerById(galaxy, request.toPlayerId)?.playerName ?? 'Support provider'} accepted the ${request.missionType} support request for ${request.targetPlanetName}. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`,
      `You accepted the ${request.missionType} support request for ${request.targetPlanetName}. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`
    );
    return { ok: true };
  }

  request.acceptedTurn = galaxy.currentTurn;
  request.executionDueTurn = galaxy.currentTurn + 1;
  request.executionExpiresOnTurn = galaxy.currentTurn + 5;
  request.state = DiplomaticProposalState.ACCEPTED;
  request.resolutionNote = request.supportType === 'PLANET_REPAIR'
    ? `Repair support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`
    : `Defense support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`;
  addSupportRequestMessages(
    galaxy,
    request,
    'Support request accepted',
    request.resolutionNote,
    request.resolutionNote
  );
  return { ok: true };
}

function rejectSupportRequest(
  galaxy: Galaxy,
  request: SupportRequest,
  requesterBody: string,
  ownerBody: string
): void {
  request.state = DiplomaticProposalState.REJECTED;
  request.resolutionNote = requesterBody;
  addSupportRequestMessages(galaxy, request, 'Support request rejected', requesterBody, ownerBody);
}

function cancelSupportRequest(
  galaxy: Galaxy,
  request: SupportRequest,
  requesterBody: string,
  ownerBody: string
): void {
  request.state = DiplomaticProposalState.CANCELLED;
  request.resolutionNote = requesterBody;
  addSupportRequestMessages(galaxy, request, 'Support request cancelled', requesterBody, ownerBody);
}

function synchronizeSupportRequests(galaxy: Galaxy): void {
  for (const request of galaxy.supportRequests) {
    if (request.state === DiplomaticProposalState.PENDING) {
      const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
      const invalidDefensiveTarget = (
        (request.supportType === 'RESOURCE_SUPPORT' || request.supportType === 'PLANET_REPAIR' || request.supportType === 'PLANET_DEFENSE')
        && (!targetPlanet || targetPlanet.info.ownerId !== request.fromPlayerId)
      );
      const invalidOffensiveTarget = (
        isOffensiveSupportRequest(request)
        && !isKnownHostileSupportTarget(galaxy, request.fromPlayerId, targetPlanet, request.supportType)
      );
      if (invalidDefensiveTarget || invalidOffensiveTarget) {
        request.state = DiplomaticProposalState.CANCELLED;
        request.resolutionNote = 'Support request auto-cancelled because the target is no longer valid.';
        continue;
      }

      if (request.expiresOnTurn <= galaxy.currentTurn) {
        request.state = DiplomaticProposalState.EXPIRED;
        request.resolutionNote = 'Support request expired before it was answered.';
        addSupportRequestMessages(
          galaxy,
          request,
          'Support request expired',
          'Your support request expired before it was answered.',
          `Support request for ${request.targetPlanetName} expired.`
        );
      }
      continue;
    }

    if (request.state !== DiplomaticProposalState.ACCEPTED || request.fulfilledTurn !== null || request.executionDueTurn === null) {
      continue;
    }

    if (request.supportType === 'RESOURCE_SUPPORT') {
      if (galaxy.currentTurn >= request.executionDueTurn) {
        executeAcceptedResourceSupportRequest(galaxy, request);
      }
      continue;
    }

    if (request.supportType === 'PLANET_REPAIR') {
      const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
      if (!targetPlanet || targetPlanet.info.ownerId !== request.fromPlayerId) {
        request.state = DiplomaticProposalState.CANCELLED;
        request.fulfilledTurn = galaxy.currentTurn;
        request.resolutionNote = 'Repair support was auto-cancelled because the target is no longer valid.';
        addSupportRequestMessages(
          galaxy,
          request,
          'Repair support cancelled',
          request.resolutionNote,
          request.resolutionNote
        );
        continue;
      }

      if (galaxy.currentTurn < request.executionDueTurn) {
        continue;
      }

      const launchResult = tryLaunchAcceptedRepairSupportRequest(galaxy, request);
      if (launchResult.ok) {
        continue;
      }

      if (request.executionExpiresOnTurn !== null && galaxy.currentTurn >= request.executionExpiresOnTurn) {
        request.state = DiplomaticProposalState.REJECTED;
        request.fulfilledTurn = galaxy.currentTurn;
        request.resolutionNote = 'Repair support auto-rejected after 5 turns because no valid repair fleet was available.';
        addSupportRequestMessages(
          galaxy,
          request,
          'Repair support auto-rejected',
          request.resolutionNote,
          request.resolutionNote
        );
        continue;
      }

      request.resolutionNote = `Waiting for a valid repair fleet to assist ${request.targetPlanetName}.`;
      continue;
    }

    if (request.supportType === 'PLANET_DEFENSE') {
      const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
      if (!targetPlanet || targetPlanet.info.ownerId !== request.fromPlayerId) {
        request.state = DiplomaticProposalState.CANCELLED;
        request.fulfilledTurn = galaxy.currentTurn;
        request.resolutionNote = 'Defense support was auto-cancelled because the target is no longer valid.';
        addSupportRequestMessages(
          galaxy,
          request,
          'Defense support cancelled',
          request.resolutionNote,
          request.resolutionNote
        );
        continue;
      }

      if (galaxy.currentTurn < request.executionDueTurn) {
        continue;
      }

      const launchResult = tryLaunchAcceptedDefenseSupportRequest(galaxy, request);
      if (launchResult.ok) {
        continue;
      }

      if (request.executionExpiresOnTurn !== null && galaxy.currentTurn >= request.executionExpiresOnTurn) {
        request.state = DiplomaticProposalState.REJECTED;
        request.fulfilledTurn = galaxy.currentTurn;
        request.resolutionNote = 'Defense support auto-rejected after 5 turns because no valid guard fleet was available.';
        addSupportRequestMessages(
          galaxy,
          request,
          'Defense support auto-rejected',
          request.resolutionNote,
          request.resolutionNote
        );
        continue;
      }

      request.resolutionNote = `Waiting for a valid guard fleet to assist ${request.targetPlanetName}.`;
      continue;
    }

    if (!isOffensiveSupportRequest(request)) {
      continue;
    }

    if (!isOffensiveSupportTargetStillValid(galaxy, request)) {
      request.state = DiplomaticProposalState.CANCELLED;
      request.fulfilledTurn = galaxy.currentTurn;
      request.resolutionNote = 'Offensive support was auto-cancelled because the target is no longer a valid hostile target.';
      addSupportRequestMessages(
        galaxy,
        request,
        'Offensive support cancelled',
        request.resolutionNote,
        request.resolutionNote
      );
      continue;
    }

    if (galaxy.currentTurn < request.executionDueTurn) {
      continue;
    }

    const launchResult = tryLaunchAcceptedOffensiveSupportRequest(galaxy, request);
    if (launchResult.ok) {
      continue;
    }

    if (request.executionExpiresOnTurn !== null && galaxy.currentTurn >= request.executionExpiresOnTurn) {
      request.state = DiplomaticProposalState.REJECTED;
      request.fulfilledTurn = galaxy.currentTurn;
      request.resolutionNote = 'Offensive support auto-rejected after 5 turns because no valid fleet met the requested minimum.';
      addSupportRequestMessages(
        galaxy,
        request,
        'Offensive support auto-rejected',
        request.resolutionNote,
        request.resolutionNote
      );
      continue;
    }

    request.resolutionNote = `Waiting for a valid ${request.missionType} fleet that meets the requested minimum.`;
  }
}

function executeAcceptedResourceSupportRequest(galaxy: Galaxy, request: Extract<SupportRequest, { supportType: 'RESOURCE_SUPPORT' }>): void {
  if (!request.approvedResources || !supportResourcesHasAnyValue(request.approvedResources)) {
    request.fulfilledTurn = galaxy.currentTurn;
    request.resolutionNote = 'No approved resources were reserved for this support request.';
    return;
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  if (!targetPlanet || targetPlanet.info.ownerId !== request.fromPlayerId) {
    refundReservedSupportResources(galaxy, request);
    request.state = DiplomaticProposalState.CANCELLED;
    request.fulfilledTurn = galaxy.currentTurn;
    request.resolutionNote = 'Delivery failed because the target planet is no longer valid. Reserved resources were refunded.';
    addSupportRequestMessages(
      galaxy,
      request,
      'Support delivery cancelled',
      request.resolutionNote,
      request.resolutionNote
    );
    return;
  }

  targetPlanet.rBDSFTQ.resources.addResourcePack(request.approvedResources);
  request.fulfilledTurn = galaxy.currentTurn;
  request.resolutionNote = `Delivered ${formatResourcesPackInline(request.approvedResources)} to ${request.targetPlanetName} on turn ${galaxy.currentTurn}.`;
  addSupportRequestMessages(
    galaxy,
    request,
    'Support delivered',
    request.resolutionNote,
    request.resolutionNote
  );
}

function refundReservedSupportResources(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'RESOURCE_SUPPORT' }>
): void {
  if (!request.approvedResources || !supportResourcesHasAnyValue(request.approvedResources) || !request.reservedSourceCoordinates) {
    return;
  }

  const sourcePlanet = resolvePlanetAtCoordinates(galaxy, request.reservedSourceCoordinates);
  if (!sourcePlanet || sourcePlanet.info.ownerId !== request.toPlayerId) {
    return;
  }

  sourcePlanet.rBDSFTQ.resources.addResourcePack(request.approvedResources);
}

function isOffensiveSupportRequestType(
  supportType: SupportRequestTypeDto
): supportType is Extract<SupportRequestTypeDto, 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET'> {
  return supportType === 'ATTACK_TARGET' || supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET';
}

function isOffensiveSupportRequest(
  request: SupportRequest
): request is Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }> {
  return isOffensiveSupportRequestType(request.supportType);
}

function isOffensiveSupportMissionTypeValid(
  supportType: Extract<SupportRequestTypeDto, 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET'>,
  missionType: FleetMissionTypeType | null
): boolean {
  switch (supportType) {
    case 'ATTACK_TARGET':
      return missionType === FleetMissionType.ATTACK;
    case 'BOMBARD_TARGET':
      return missionType === FleetMissionType.BOMBARD;
    case 'SIEGE_TARGET':
      return missionType === FleetMissionType.SIEGE;
  }
}

function isKnownHostileSupportTarget(
  galaxy: Galaxy,
  viewerPlayerId: number,
  targetPlanet: Planet | null,
  supportType: SupportRequestTypeDto
): boolean {
  if (!targetPlanet || targetPlanet.info.ownerId === null || targetPlanet.info.ownerId === viewerPlayerId) {
    return false;
  }

  if (!targetPlanet.lastReportData.has(viewerPlayerId)) {
    return false;
  }

  return isSupportMissionLegalForProvider(galaxy, viewerPlayerId, targetPlanet.info.ownerId, supportType);
}

function isSupportMissionLegalForProvider(
  galaxy: Galaxy,
  providerPlayerId: number,
  targetOwnerPlayerId: number,
  supportType: SupportRequestTypeDto
): boolean {
  const status = resolveDiplomaticStatus(galaxy, providerPlayerId, targetOwnerPlayerId);
  if (supportType === 'ATTACK_TARGET') {
    return status === DiplomaticStatus.WAR
      || status === DiplomaticStatus.NEUTRAL
      || status === DiplomaticStatus.PASSIVE;
  }

  if (supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET') {
    return status === DiplomaticStatus.WAR;
  }

  return isSupportRequestAllowedForStatus(supportType, status);
}

function isOffensiveSupportTargetStillValid(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }>
): boolean {
  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  if (!targetPlanet || targetPlanet.info.ownerId === null) {
    return false;
  }

  return isSupportMissionLegalForProvider(galaxy, request.toPlayerId, targetPlanet.info.ownerId, request.supportType);
}

function tryLaunchAcceptedOffensiveSupportRequest(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }>
): { ok: true } | { ok: false } {
  const candidates = resolveOffensiveSupportLaunchCandidates(galaxy, request);
  for (const candidate of candidates) {
    const result = createFleetMission(
      { galaxy, playerId: request.toPlayerId },
      {
        missionType: request.missionType,
        origin: candidate.originCoordinates,
        target: request.targetCoordinates,
        ships: candidate.ships,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: request.bombardmentPriorities
      }
    );
    if (!result.ok) {
      continue;
    }

    request.fulfilledTurn = galaxy.currentTurn;
    request.launchedFleetId = result.value.fleet.fleetId;
    request.launchOriginPlanetName = candidate.originPlanet.basicInfo.name;
    request.launchOriginCoordinates = candidate.originCoordinates;
    request.resolutionNote = `Auto-launched Fleet #${result.value.fleet.fleetId} from ${candidate.originPlanet.basicInfo.name} toward ${request.targetPlanetName}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Offensive support launched',
      request.resolutionNote,
      request.resolutionNote
    );
    return { ok: true };
  }

  return { ok: false };
}

function tryLaunchAcceptedRepairSupportRequest(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'PLANET_REPAIR' }>
): { ok: true } | { ok: false } {
  const existingFleet = findExistingSupportFleet(
    galaxy,
    request.toPlayerId,
    FleetMissionType.REPAIR,
    request.targetCoordinates
  );
  if (existingFleet) {
    request.fulfilledTurn = galaxy.currentTurn;
    request.resolutionNote = `Repair support is already being handled by Fleet #${existingFleet.fleetId}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Repair support in progress',
      request.resolutionNote,
      request.resolutionNote
    );
    return { ok: true };
  }

  const candidates = resolveRepairSupportLaunchCandidates(galaxy, request);
  for (const candidate of candidates) {
    const result = createFleetMission(
      { galaxy, playerId: request.toPlayerId },
      {
        missionType: FleetMissionType.REPAIR,
        origin: candidate.originCoordinates,
        target: request.targetCoordinates,
        ships: candidate.ships,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      }
    );
    if (!result.ok) {
      continue;
    }

    request.fulfilledTurn = galaxy.currentTurn;
    request.resolutionNote = `Auto-launched repair Fleet #${result.value.fleet.fleetId} from ${candidate.originPlanet.basicInfo.name} toward ${request.targetPlanetName}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Repair support launched',
      request.resolutionNote,
      request.resolutionNote
    );
    return { ok: true };
  }

  return { ok: false };
}

function tryLaunchAcceptedDefenseSupportRequest(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'PLANET_DEFENSE' }>
): { ok: true } | { ok: false } {
  const existingFleet = findExistingSupportFleet(
    galaxy,
    request.toPlayerId,
    FleetMissionType.DEFEND,
    request.targetCoordinates
  );
  if (existingFleet) {
    request.fulfilledTurn = galaxy.currentTurn;
    request.resolutionNote = `Defense support is already being handled by Fleet #${existingFleet.fleetId}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Defense support in progress',
      request.resolutionNote,
      request.resolutionNote
    );
    return { ok: true };
  }

  const candidates = resolveDefenseSupportLaunchCandidates(galaxy, request);
  for (const candidate of candidates) {
    const result = createFleetMission(
      { galaxy, playerId: request.toPlayerId },
      {
        missionType: FleetMissionType.DEFEND,
        origin: candidate.originCoordinates,
        target: request.targetCoordinates,
        ships: candidate.ships,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      }
    );
    if (!result.ok) {
      continue;
    }

    request.fulfilledTurn = galaxy.currentTurn;
    request.resolutionNote = `Auto-launched guard Fleet #${result.value.fleet.fleetId} from ${candidate.originPlanet.basicInfo.name} toward ${request.targetPlanetName}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Defense support launched',
      request.resolutionNote,
      request.resolutionNote
    );
    return { ok: true };
  }

  return { ok: false };
}

function findExistingSupportFleet(
  galaxy: Galaxy,
  providerPlayerId: number,
  missionType: FleetMissionTypeType,
  targetCoordinates: ClientCoordinates
): Fleet | null {
  return galaxy.activeFleets.find((fleet) =>
    fleet.ownerId === providerPlayerId
    && fleet.missionType === missionType
    && sameCoordinates(fleet.target, targetCoordinates)
    && fleet.state !== FleetState.RETURNING
    && fleet.state !== FleetState.MISSION_FAILURE_RETURNING
  ) ?? null;
}

function resolveOffensiveSupportLaunchCandidates(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }>
): Array<{
  originPlanet: Planet;
  originCoordinates: ClientCoordinates;
  ships: CreateFleetShipSelectionEntry[];
}> {
  const candidates: Array<{
    originPlanet: Planet;
    originCoordinates: ClientCoordinates;
    ships: CreateFleetShipSelectionEntry[];
    distance: number;
  }> = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== request.toPlayerId) {
          continue;
        }

        const ships = buildMinimumSupportShipSelection(planet, request.minimumShips);
        if (!ships) {
          continue;
        }

        const originCoordinates = toPlanetCoordinates(planet);
        candidates.push({
          originPlanet: planet,
          originCoordinates,
          ships,
          distance: calculateTravelDistance(originCoordinates, request.targetCoordinates)
        });
      }
    }
  }

  candidates.sort((left, right) =>
    left.distance - right.distance
    || comparePlanetCoordinates(left.originPlanet, right.originPlanet)
  );

  return candidates.map(({ originPlanet, originCoordinates, ships }) => ({
    originPlanet,
    originCoordinates,
    ships
  }));
}

function resolveRepairSupportLaunchCandidates(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'PLANET_REPAIR' }>
): Array<{
  originPlanet: Planet;
  originCoordinates: ClientCoordinates;
  ships: CreateFleetShipSelectionEntry[];
}> {
  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  const targetRepairNeed = targetPlanet ? estimateSupportRepairNeed(targetPlanet) : 0;
  const candidates: Array<{
    originPlanet: Planet;
    originCoordinates: ClientCoordinates;
    ships: CreateFleetShipSelectionEntry[];
    distance: number;
  }> = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== request.toPlayerId) {
          continue;
        }

        const ships = buildRepairSupportShipSelection(planet, targetRepairNeed);
        if (!ships) {
          continue;
        }

        const originCoordinates = toPlanetCoordinates(planet);
        candidates.push({
          originPlanet: planet,
          originCoordinates,
          ships,
          distance: calculateTravelDistance(originCoordinates, request.targetCoordinates)
        });
      }
    }
  }

  candidates.sort((left, right) =>
    left.distance - right.distance
    || comparePlanetCoordinates(left.originPlanet, right.originPlanet)
  );

  return candidates.map(({ originPlanet, originCoordinates, ships }) => ({
    originPlanet,
    originCoordinates,
    ships
  }));
}

function resolveDefenseSupportLaunchCandidates(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'PLANET_DEFENSE' }>
): Array<{
  originPlanet: Planet;
  originCoordinates: ClientCoordinates;
  ships: CreateFleetShipSelectionEntry[];
}> {
  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  if (!targetPlanet) {
    return [];
  }

  const targetDefenseStrength = estimatePlanetSupportCombatStrength(targetPlanet);
  const nearbyThreatStrength = estimateNearbySupportThreatStrength(galaxy, request.fromPlayerId, targetPlanet);
  const candidates: Array<{
    originPlanet: Planet;
    originCoordinates: ClientCoordinates;
    ships: CreateFleetShipSelectionEntry[];
    distance: number;
    selectedStrength: number;
  }> = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== request.toPlayerId) {
          continue;
        }

        const ships = buildDefenseSupportShipSelection(planet, nearbyThreatStrength, targetDefenseStrength);
        if (!ships) {
          continue;
        }

        const originCoordinates = toPlanetCoordinates(planet);
        candidates.push({
          originPlanet: planet,
          originCoordinates,
          ships,
          distance: calculateTravelDistance(originCoordinates, request.targetCoordinates),
          selectedStrength: estimateSupportShipSelectionCombatStrength(ships)
        });
      }
    }
  }

  candidates.sort((left, right) =>
    left.distance - right.distance
    || right.selectedStrength - left.selectedStrength
    || comparePlanetCoordinates(left.originPlanet, right.originPlanet)
  );

  return candidates.map(({ originPlanet, originCoordinates, ships }) => ({
    originPlanet,
    originCoordinates,
    ships
  }));
}

function buildMinimumSupportShipSelection(
  planet: Planet,
  minimumShips: ShipAmountEntry[]
): CreateFleetShipSelectionEntry[] | null {
  const availableUndamaged = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const availableDamaged = ManyShips.damagedCountByType(planet.rBDSFTQ.ships);
  const selections: CreateFleetShipSelectionEntry[] = [];

  for (const minimum of minimumShips) {
    const undamagedAvailable = availableUndamaged.get(minimum.type as ShipTypeType) ?? 0;
    const damagedAvailable = availableDamaged.get(minimum.type as ShipTypeType) ?? 0;
    if (undamagedAvailable + damagedAvailable < minimum.amount) {
      return null;
    }

    const undamagedAmount = Math.min(undamagedAvailable, minimum.amount);
    const damagedAmount = Math.max(0, minimum.amount - undamagedAmount);
    selections.push({
      type: minimum.type,
      undamagedAmount,
      damagedAmount
    });
  }

  return selections;
}

function buildRepairSupportShipSelection(
  planet: Planet,
  repairNeed: number
): CreateFleetShipSelectionEntry[] | null {
  const repairDroneBlueprint = SHIP_BLUEPRINTS.get(ShipType.REPAIR_DRONE);
  if (!repairDroneBlueprint) {
    return null;
  }

  const availableUndamaged = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const availableRepairDrones = availableUndamaged.get(ShipType.REPAIR_DRONE) ?? 0;
  if (availableRepairDrones <= 0) {
    return null;
  }

  const carrierCandidates = [...availableUndamaged.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0 || shipType === ShipType.REPAIR_DRONE) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType as ShipTypeType);
      return Boolean(
        blueprint
        && blueprint.canJump
        && blueprint.hangarCapacity >= repairDroneBlueprint.size
      );
    })
    .map(([shipType]) => SHIP_BLUEPRINTS.get(shipType as ShipTypeType)!)
    .sort((left, right) =>
      left.hangarCapacity - right.hangarCapacity
      || left.type.localeCompare(right.type)
    );

  const carrier = carrierCandidates[0];
  if (!carrier) {
    return null;
  }

  const desiredRepairDrones = repairNeed >= 200 ? 2 : 1;
  const selectedRepairDrones = Math.max(1, Math.min(availableRepairDrones, desiredRepairDrones));
  return [
    {
      type: carrier.type,
      undamagedAmount: 1,
      damagedAmount: 0
    },
    {
      type: ShipType.REPAIR_DRONE,
      undamagedAmount: selectedRepairDrones,
      damagedAmount: 0
    }
  ];
}

function buildDefenseSupportShipSelection(
  planet: Planet,
  nearbyThreatStrength: number,
  targetDefenseStrength: number
): CreateFleetShipSelectionEntry[] | null {
  const availableUndamaged = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const combatShips = [...availableUndamaged.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType as ShipTypeType);
      return Boolean(
        blueprint
        && blueprint.weapons.length > 0
        && !blueprint.purposes.has(ShipPurpose.CARGO)
      );
    })
    .map(([shipType, amount]) => ({
      type: shipType as ShipTypeType,
      amount,
      power: estimateSupportShipCombatPower(shipType as ShipTypeType)
    }))
    .sort((left, right) => right.power - left.power || left.type.localeCompare(right.type));

  const totalCombatPower = combatShips.reduce((sum, entry) => sum + (entry.power * entry.amount), 0);
  const reservePower = totalCombatPower * 0.45;
  const availableLaunchPower = totalCombatPower - reservePower;
  if (availableLaunchPower <= 0) {
    return null;
  }

  const desiredLaunchPower = Math.min(
    availableLaunchPower,
    Math.max(
      nearbyThreatStrength - targetDefenseStrength,
      nearbyThreatStrength * 0.45,
      18
    )
  );
  if (desiredLaunchPower <= 0) {
    return null;
  }

  const selection: CreateFleetShipSelectionEntry[] = [];
  let selectedPower = 0;
  for (const entry of combatShips) {
    if (selectedPower >= desiredLaunchPower) {
      break;
    }

    const remainingPower = desiredLaunchPower - selectedPower;
    let amountToSend = Math.min(entry.amount, Math.max(1, Math.ceil(remainingPower / entry.power)));
    while (
      amountToSend > 0
      && (totalCombatPower - (selectedPower + (amountToSend * entry.power))) < reservePower
    ) {
      amountToSend -= 1;
    }

    if (amountToSend <= 0) {
      continue;
    }

    selection.push({
      type: entry.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    selectedPower += entry.power * amountToSend;
  }

  return selection.length > 0 ? selection : null;
}

function estimateSupportRepairNeed(planet: Planet): number {
  let totalMissingHull = 0;
  for (const damagedShip of planet.rBDSFTQ.ships.damagedShips) {
    const blueprint = SHIP_BLUEPRINTS.get(damagedShip.type as ShipTypeType);
    if (!blueprint) {
      continue;
    }

    totalMissingHull += Math.max(0, blueprint.hullPointsCapacity - damagedShip.hull);
  }

  return totalMissingHull;
}

function estimateNearbySupportThreatStrength(
  galaxy: Galaxy,
  viewerPlayerId: number,
  targetPlanet: Planet
): number {
  const targetCoordinates = toPlanetCoordinates(targetPlanet);
  let bestStrength = 0;

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet === targetPlanet || planet.info.ownerId === null || planet.info.ownerId === viewerPlayerId) {
          continue;
        }

        if (calculateTravelDistance(targetCoordinates, toPlanetCoordinates(planet)) > 3) {
          continue;
        }

        const report = planet.lastReportData.get(viewerPlayerId);
        if (!report) {
          continue;
        }

        bestStrength = Math.max(bestStrength, estimateSupportReportCombatStrength(report));
      }
    }
  }

  return Math.max(24, bestStrength);
}

function estimateSupportReportCombatStrength(report: EspionageReportData): number {
  let total = 0;
  for (const [shipType, amount] of report.ships.entries()) {
    total += estimateSupportShipCombatPower(shipType as ShipTypeType) * amount;
  }
  for (const defenceEntry of report.defences) {
    total += estimateSupportDefenceCombatPower(defenceEntry.type as DefenceTypeType) * defenceEntry.amount;
  }

  if (total <= 0) {
    total += report.totalShipsAmount * 6;
    total += report.totalDefencesAmount * 5;
  }

  return total;
}

function estimatePlanetSupportCombatStrength(planet: Planet): number {
  let total = 0;
  for (const [shipType, amount] of planet.rBDSFTQ.ships.countByType().entries()) {
    total += estimateSupportShipCombatPower(shipType as ShipTypeType) * amount;
  }
  for (const [defenceType, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
    total += estimateSupportDefenceCombatPower(defenceType as DefenceTypeType) * amount;
  }
  return total;
}

function estimateSupportShipSelectionCombatStrength(
  ships: CreateFleetShipSelectionEntry[]
): number {
  let total = 0;
  for (const entry of ships) {
    total += estimateSupportShipCombatPower(entry.type as ShipTypeType) * (entry.undamagedAmount + entry.damagedAmount);
  }
  return total;
}

function estimateSupportShipCombatPower(shipType: ShipTypeType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function estimateSupportDefenceCombatPower(defenceType: DefenceTypeType): number {
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 18) + (blueprint.shieldCapacity / 12);
}

function resolveBestResourceSupportSourcePlanet(
  galaxy: Galaxy,
  ownerPlayerId: number,
  requiredResources: ResourcesPackType
): Planet | null {
  let bestPlanet: Planet | null = null;

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== ownerPlayerId) {
          continue;
        }

        if (!planet.rBDSFTQ.resources.isSufficient(requiredResources)) {
          continue;
        }

        if (!bestPlanet) {
          bestPlanet = planet;
          continue;
        }

        const currentValue = planet.rBDSFTQ.resources.getTotalValuedResourceAmount();
        const bestValue = bestPlanet.rBDSFTQ.resources.getTotalValuedResourceAmount();
        if (currentValue > bestValue) {
          bestPlanet = planet;
          continue;
        }

        if (
          currentValue === bestValue
          && comparePlanetCoordinates(planet, bestPlanet) < 0
        ) {
          bestPlanet = planet;
        }
      }
    }
  }

  return bestPlanet;
}

function isSupportRequestAllowedForStatus(
  supportType: SupportRequestTypeDto,
  status: DiplomaticStatusType
): boolean {
  if (
    supportType === 'RESOURCE_SUPPORT'
    || supportType === 'ATTACK_TARGET'
    || supportType === 'BOMBARD_TARGET'
    || supportType === 'SIEGE_TARGET'
  ) {
    return status === DiplomaticStatus.ALLIED;
  }

  return status === DiplomaticStatus.ALLIED || status === DiplomaticStatus.PEACE;
}

function comparePlanetCoordinates(left: Planet, right: Planet): number {
  return left.basicInfo.solarSystem.coordinates.x - right.basicInfo.solarSystem.coordinates.x
    || left.basicInfo.solarSystem.coordinates.y - right.basicInfo.solarSystem.coordinates.y
    || left.basicInfo.order - right.basicInfo.order;
}

function addSupportRequestMessages(
  galaxy: Galaxy,
  request: SupportRequest,
  title: string,
  requesterBody: string,
  providerBody: string
): void {
  const requester = resolvePlayerById(galaxy, request.fromPlayerId);
  const provider = resolvePlayerById(galaxy, request.toPlayerId);
  if (requester) {
    addPlayerMessage(
      requester,
      galaxy.currentTurn,
      title,
      requesterBody,
      request.toPlayerId,
      provider?.playerName ?? null
    );
  }
  if (provider) {
    addPlayerMessage(
      provider,
      galaxy.currentTurn,
      title,
      providerBody,
      request.fromPlayerId,
      requester?.playerName ?? null
    );
  }
}

function formatResourcesPackInline(pack: ResourcesPackType): string {
  const entries = [
    pack.metal > 0 ? `${pack.metal} metal` : null,
    pack.crystal > 0 ? `${pack.crystal} crystal` : null,
    pack.deuterium > 0 ? `${pack.deuterium} deuterium` : null
  ].filter((entry): entry is string => !!entry);
  return entries.length > 0 ? entries.join(', ') : 'no resources';
}

function synchronizeTradePortState(galaxy: Galaxy): boolean {
  let changed = false;

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        const ownerId = planet.info.ownerId;
        if (ownerId === null) {
          if (planet.rBDSFTQ.tradePortOffers.length > 0) {
            planet.rBDSFTQ.tradePortOffers = [];
            changed = true;
          }
          continue;
        }

        const owner = resolvePlayerById(galaxy, ownerId);
        if (!owner) {
          if (planet.rBDSFTQ.tradePortOffers.length > 0) {
            planet.rBDSFTQ.tradePortOffers = [];
            changed = true;
          }
          continue;
        }

        const syncResult = synchronizeTradePortOffers({
          existingOffers: planet.rBDSFTQ.tradePortOffers,
          currentTurn: galaxy.currentTurn,
          tradePortLevel: planet.getBuildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT),
          jumpGateLevel: planet.getBuildingLevel(BuildingType.JUMP_GATE),
          tradePortCapacity: planet.getTradePortCapacity(
            owner.getTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY),
            owner.getTechLevel(TechnologyType.GRAVITON_TECHNOLOGY)
          )
        });
        if (!syncResult.changed) {
          continue;
        }

        planet.rBDSFTQ.tradePortOffers = syncResult.offers;
        changed = true;
      }
    }
  }

  return changed;
}

function resourceAmountForType(
  resources: ResourcesPackType,
  resourceType: TradePortOffer['costResourceType']
): number {
  return resources[resourceType];
}

function addResourceAmountByType(
  resources: ResourcesPackType,
  resourceType: TradePortOffer['getResourceType'],
  amount: number
): void {
  resources[resourceType] += Math.max(0, Math.floor(amount));
}

function subtractResourceAmountByType(
  resources: ResourcesPackType,
  resourceType: TradePortOffer['costResourceType'],
  amount: number
): void {
  resources[resourceType] -= Math.max(0, Math.floor(amount));
}

function addMaintenanceResolutionReports(
  galaxy: Galaxy,
  fleet: Fleet,
  targetPlanet: Planet,
  targetOwner: Player,
  title: string,
  requesterBody: string,
  ownerBody: string
): void {
  const requester = resolvePlayerById(galaxy, fleet.ownerId);
  if (requester) {
    requester.addReport(new FleetReport({
      reportId: requester.createReportId(),
      createdTurn: galaxy.currentTurn,
      title,
      sourceCoordinates: { ...fleet.target },
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: targetOwner.playerName
    }, requesterBody));
  }

  if (targetOwner.playerId === fleet.ownerId) {
    return;
  }

  targetOwner.addReport(new FleetReport({
    reportId: targetOwner.createReportId(),
    createdTurn: galaxy.currentTurn,
    title,
    sourceCoordinates: { ...fleet.target },
    sourcePlanetName: targetPlanet.basicInfo.name,
    sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
    senderPlayerName: requester?.playerName ?? null
  }, ownerBody));
}

function resolvePlanetAtCoordinates(galaxy: Galaxy, coordinates: ClientCoordinates): Planet | null {
  return galaxy.stars[coordinates.y]?.[coordinates.x]?.planets[coordinates.z] ?? null;
}

function findPendingMaintenanceRequestForFleet(
  galaxy: Galaxy,
  ownerId: number,
  fleetId: number
): MaintenanceRequest | null {
  return galaxy.maintenanceRequests.find((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.fromPlayerId === ownerId
    && request.fleetId === fleetId
  ) ?? null;
}

function isMaintenanceStatusAllowed(status: DiplomaticStatusType): boolean {
  return status === DiplomaticStatus.SELF
    || status === DiplomaticStatus.ALLIED
    || status === DiplomaticStatus.PEACE
    || status === DiplomaticStatus.PASSIVE;
}

function buildMaintenanceOptionsDto(context: {
  fleet: Fleet;
  targetPlanet: Planet;
  autoApprove: boolean;
  fuelCap: number;
  supportCap: number;
}): FleetMaintenanceOptionsDto {
  const remainingCargoCapacity = Math.max(0, context.fleet.totalCargoCapacity - context.fleet.usedCargoCapacity);
  const currentBombHangarUsage = calculateBombHangarUsageForManyDefences(context.fleet.carriedBombs);
  const remainingHangarCapacity = Math.max(
    0,
    ManyShips.totalTravelHangarCapacity(context.fleet.ships)
    - ManyShips.totalRequiredHangarCapacity(context.fleet.ships)
    - currentBombHangarUsage
  );
  const remainingBomberHangarCapacity = Math.max(
    0,
    ManyShips.totalBomberHangarCapacity(context.fleet.ships) - currentBombHangarUsage
  );

  return {
    fleetId: context.fleet.fleetId,
    targetPlanetName: context.targetPlanet.basicInfo.name,
    autoApprove: context.autoApprove,
    fuelCap: context.fuelCap,
    supportCap: context.supportCap,
    availableFuel: Math.max(0, Math.floor(context.targetPlanet.rBDSFTQ.resources.deuterium)),
    remainingCargoCapacity,
    remainingHangarCapacity,
    remainingBomberHangarCapacity,
    availableShips: buildMaintenanceShipOptions(context.targetPlanet),
    availableBombs: buildMaintenanceBombOptions(context.targetPlanet)
  };
}

function buildMaintenanceShipOptions(planet: Planet): FleetMaintenanceShipOptionDto[] {
  const totalCounts = ManyShips.countByType(planet.rBDSFTQ.ships);
  const undamagedCounts = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const damagedCounts = ManyShips.damagedCountByType(planet.rBDSFTQ.ships);

  return [...totalCounts.entries()]
    .map(([type, available]) => {
      const blueprint = SHIP_BLUEPRINTS.get(type);
      if (!blueprint || blueprint.hullClass !== HullClass.SMALL) {
        return null;
      }

      return {
        type,
        available,
        undamagedAvailable: undamagedCounts.get(type) ?? 0,
        damagedAvailable: damagedCounts.get(type) ?? 0,
        size: blueprint.size
      } satisfies FleetMaintenanceShipOptionDto;
    })
    .filter((entry): entry is FleetMaintenanceShipOptionDto => !!entry && entry.available > 0)
    .sort((left, right) => left.type.localeCompare(right.type));
}

function buildMaintenanceBombOptions(planet: Planet): FleetMaintenanceBombOptionDto[] {
  const totalCounts = ManyDefences.countByType(planet.rBDSFTQ.defences);
  const undamagedCounts = ManyDefences.undamagedCountByType(planet.rBDSFTQ.defences);
  const damagedCounts = ManyDefences.damagedCountByType(planet.rBDSFTQ.defences);

  return [...totalCounts.entries()]
    .map(([type, available]) => {
      if (!isPlanetaryBombDefenceType(type)) {
        return null;
      }

      const blueprint = DEFENCE_BLUEPRINTS.get(type);
      if (!blueprint) {
        return null;
      }

      return {
        type,
        available,
        undamagedAvailable: undamagedCounts.get(type) ?? 0,
        damagedAvailable: damagedCounts.get(type) ?? 0,
        size: blueprint.size
      } satisfies FleetMaintenanceBombOptionDto;
    })
    .filter((entry): entry is FleetMaintenanceBombOptionDto => !!entry && entry.available > 0)
    .sort((left, right) => left.type.localeCompare(right.type));
}

function validateRequestedMaintenancePayload(
  context: {
    fleet: Fleet;
    targetPlanet: Planet;
    fuelCap: number;
    supportCap: number;
  },
  payload: MaintenanceRequest['requested']
): { status: number; error: string } | null {
  const options = buildMaintenanceOptionsDto({
    fleet: context.fleet,
    targetPlanet: context.targetPlanet,
    autoApprove: false,
    fuelCap: context.fuelCap,
    supportCap: context.supportCap
  });

  if (payload.fuel > Math.min(options.fuelCap, options.availableFuel, options.remainingCargoCapacity)) {
    return { status: 400, error: 'Requested fuel exceeds depot or fleet capacity.' };
  }

  const shipOptions = new Map(options.availableShips.map((entry) => [entry.type, entry]));
  const bombOptions = new Map(options.availableBombs.map((entry) => [entry.type, entry]));
  let supportSize = 0;
  let requiredHangar = 0;
  let requiredBomberHangar = 0;

  for (const shipRequest of payload.ships) {
    const option = shipOptions.get(shipRequest.type);
    const blueprint = SHIP_BLUEPRINTS.get(shipRequest.type);
    if (!option || !blueprint || blueprint.hullClass !== HullClass.SMALL) {
      return { status: 400, error: `${shipRequest.type}: maintenance can request only small ships stored on the target planet.` };
    }
    if (shipRequest.amount > option.available) {
      return { status: 400, error: `${shipRequest.type}: requested amount exceeds local depot stock.` };
    }

    supportSize += blueprint.size * shipRequest.amount;
    if (!blueprint.canJump) {
      requiredHangar += blueprint.size * shipRequest.amount;
    }
  }

  for (const bombRequest of payload.bombs) {
    const option = bombOptions.get(bombRequest.type);
    const blueprint = DEFENCE_BLUEPRINTS.get(bombRequest.type);
    if (!option || !blueprint || !isPlanetaryBombDefenceType(bombRequest.type)) {
      return { status: 400, error: `${bombRequest.type}: requested bombs are not available in the target depot.` };
    }
    if (bombRequest.amount > option.available) {
      return { status: 400, error: `${bombRequest.type}: requested amount exceeds local depot stock.` };
    }

    supportSize += blueprint.size * bombRequest.amount;
    requiredHangar += blueprint.size * bombRequest.amount;
    requiredBomberHangar += blueprint.size * bombRequest.amount;
  }

  if (supportSize > options.supportCap) {
    return { status: 400, error: 'Requested ships and bombs exceed Alliance Depot support capacity.' };
  }

  if (requiredHangar > options.remainingHangarCapacity) {
    return { status: 400, error: 'Requested ships and bombs do not fit into the fleet hangar capacity.' };
  }

  if (requiredBomberHangar > options.remainingBomberHangarCapacity) {
    return { status: 400, error: 'Requested bombs do not fit into bomber hangar capacity.' };
  }

  return null;
}

function maintenancePayloadHasAnySelection(payload: MaintenanceRequest['requested']): boolean {
  return payload.fuel > 0 || payload.ships.length > 0 || payload.bombs.length > 0;
}

function clampMaintenancePayloadToRequested(
  desired: MaintenanceTransferPayloadDto,
  requested: MaintenanceRequest['requested']
): MaintenanceRequest['requested'] {
  const normalizedDesired = normalizeMaintenanceTransferPayload(desired);
  const requestedShips = new Map(requested.ships.map((entry) => [entry.type, entry.amount]));
  const requestedBombs = new Map(requested.bombs.map((entry) => [entry.type, entry.amount]));

  return {
    fuel: Math.min(normalizedDesired.fuel, requested.fuel),
    ships: normalizedDesired.ships.map((entry) => ({
      type: entry.type,
      amount: Math.min(entry.amount, requestedShips.get(entry.type) ?? 0)
    })).filter((entry) => entry.amount > 0),
    bombs: normalizedDesired.bombs.map((entry) => ({
      type: entry.type,
      amount: Math.min(entry.amount, requestedBombs.get(entry.type) ?? 0)
    })).filter((entry) => entry.amount > 0)
  };
}

function applyMaintenanceTransfer(
  fleet: Fleet,
  targetPlanet: Planet,
  requested: MaintenanceRequest['requested']
): MaintenanceRequest['approved'] {
  const normalized = normalizeMaintenanceTransferPayload(requested);
  const approvedFuel = Math.min(
    normalized.fuel,
    Math.max(0, targetPlanet.rBDSFTQ.resources.deuterium),
    Math.max(0, fleet.totalCargoCapacity - fleet.usedCargoCapacity)
  );
  if (approvedFuel > 0) {
    targetPlanet.rBDSFTQ.resources.deuterium -= approvedFuel;
    fleet.cargo.deuterium += approvedFuel;
    fleet.usedCargoCapacity = fleet.cargo.metal + fleet.cargo.crystal + fleet.cargo.deuterium;
  }

  const approvedShips = extractMaintenanceShips(targetPlanet, fleet, normalized.ships);
  const approvedBombs = extractMaintenanceBombs(targetPlanet, fleet, normalized.bombs);
  if (approvedShips.totalShipsCount() > 0) {
    fleet.ships.addManyShips(approvedShips);
    fleet.totalCargoCapacity = ManyShips.totalCargoCapacity(fleet.ships);
  }
  if (approvedBombs.totalDefencesCount() > 0) {
    fleet.carriedBombs.addManyDefences(approvedBombs);
  }

  return {
    fuel: approvedFuel,
    ships: [...ManyShips.countByType(approvedShips).entries()].map(([type, amount]) => ({ type, amount })),
    bombs: [...ManyDefences.countByType(approvedBombs).entries()].map(([type, amount]) => ({ type, amount }))
  };
}

function extractMaintenanceShips(
  targetPlanet: Planet,
  fleet: Fleet,
  requestedShips: MaintenanceRequest['requested']['ships']
): ManyShipsType {
  const extracted = ManyShips.empty();
  let remainingHangarCapacity = Math.max(
    0,
    ManyShips.totalTravelHangarCapacity(fleet.ships)
    - ManyShips.totalRequiredHangarCapacity(fleet.ships)
    - calculateBombHangarUsageForManyDefences(fleet.carriedBombs)
  );

  for (const request of requestedShips) {
    const blueprint = SHIP_BLUEPRINTS.get(request.type);
    if (!blueprint || blueprint.hullClass !== HullClass.SMALL) {
      continue;
    }

    const hangarCost = blueprint.canJump ? 0 : blueprint.size;
    let remaining = request.amount;
    const availableUndamaged = targetPlanet.rBDSFTQ.ships.undamagedShipsCount[request.type] ?? 0;
    const takeUndamaged = Math.min(availableUndamaged, remaining, hangarCost <= 0 ? remaining : Math.floor(remainingHangarCapacity / hangarCost));
    if (takeUndamaged > 0) {
      extracted.addUndamaged(request.type, takeUndamaged);
      remaining -= takeUndamaged;
      remainingHangarCapacity = Math.max(0, remainingHangarCapacity - (takeUndamaged * hangarCost));
      const nextUndamaged = availableUndamaged - takeUndamaged;
      if (nextUndamaged > 0) {
        targetPlanet.rBDSFTQ.ships.undamagedShipsCount[request.type] = nextUndamaged;
      } else {
        delete targetPlanet.rBDSFTQ.ships.undamagedShipsCount[request.type];
      }
    }

    if (remaining <= 0) {
      continue;
    }

    const updatedDamaged: typeof targetPlanet.rBDSFTQ.ships.damagedShips = [];
    for (const damagedShip of targetPlanet.rBDSFTQ.ships.damagedShips) {
      if (
        damagedShip.type === request.type
        && remaining > 0
        && (hangarCost <= 0 || remainingHangarCapacity >= hangarCost)
      ) {
        extracted.addDamaged(damagedShip.type, damagedShip.hull);
        remaining -= 1;
        remainingHangarCapacity = Math.max(0, remainingHangarCapacity - hangarCost);
        continue;
      }

      updatedDamaged.push(damagedShip);
    }
    targetPlanet.rBDSFTQ.ships.damagedShips = updatedDamaged;
  }

  return extracted;
}

function extractMaintenanceBombs(
  targetPlanet: Planet,
  fleet: Fleet,
  requestedBombs: MaintenanceRequest['requested']['bombs']
): InstanceType<typeof ManyDefences> {
  const extracted = ManyDefences.empty();
  let remainingTotalHangar = Math.max(
    0,
    ManyShips.totalTravelHangarCapacity(fleet.ships)
    - ManyShips.totalRequiredHangarCapacity(fleet.ships)
    - calculateBombHangarUsageForManyDefences(fleet.carriedBombs)
  );
  let remainingBomberHangar = Math.max(
    0,
    ManyShips.totalBomberHangarCapacity(fleet.ships) - calculateBombHangarUsageForManyDefences(fleet.carriedBombs)
  );

  for (const request of requestedBombs) {
    if (!isPlanetaryBombDefenceType(request.type)) {
      continue;
    }

    const blueprint = DEFENCE_BLUEPRINTS.get(request.type);
    if (!blueprint) {
      continue;
    }

    let remaining = request.amount;
    const size = Math.max(0, blueprint.size);
    const availableUndamaged = targetPlanet.rBDSFTQ.defences.undamagedDefencesCount[request.type] ?? 0;
    const hangarLimitedAmount = size <= 0
      ? remaining
      : Math.min(
        remaining,
        Math.floor(remainingTotalHangar / size),
        Math.floor(remainingBomberHangar / size)
      );
    const takeUndamaged = Math.min(availableUndamaged, hangarLimitedAmount);
    if (takeUndamaged > 0) {
      extracted.addUndamaged(request.type, takeUndamaged);
      remaining -= takeUndamaged;
      remainingTotalHangar = Math.max(0, remainingTotalHangar - (takeUndamaged * size));
      remainingBomberHangar = Math.max(0, remainingBomberHangar - (takeUndamaged * size));
      const nextUndamaged = availableUndamaged - takeUndamaged;
      if (nextUndamaged > 0) {
        targetPlanet.rBDSFTQ.defences.undamagedDefencesCount[request.type] = nextUndamaged;
      } else {
        delete targetPlanet.rBDSFTQ.defences.undamagedDefencesCount[request.type];
      }
    }

    if (remaining <= 0) {
      continue;
    }

    const updatedDamaged: typeof targetPlanet.rBDSFTQ.defences.damagedDefences = [];
    for (const damagedBomb of targetPlanet.rBDSFTQ.defences.damagedDefences) {
      if (
        damagedBomb.type === request.type
        && remaining > 0
        && (size <= 0 || (remainingTotalHangar >= size && remainingBomberHangar >= size))
      ) {
        extracted.addDamaged(damagedBomb.type, damagedBomb.hull);
        remaining -= 1;
        remainingTotalHangar = Math.max(0, remainingTotalHangar - size);
        remainingBomberHangar = Math.max(0, remainingBomberHangar - size);
        continue;
      }

      updatedDamaged.push(damagedBomb);
    }
    targetPlanet.rBDSFTQ.defences.damagedDefences = updatedDamaged;
  }

  return extracted;
}

function calculateBombHangarUsageForManyDefences(defences: InstanceType<typeof ManyDefences>): number {
  let total = 0;
  for (const [type, amount] of ManyDefences.countByType(defences).entries()) {
    const blueprint = DEFENCE_BLUEPRINTS.get(type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.size) * amount;
  }

  return total;
}

function summarizeMaintenanceTransfer(payload: MaintenanceRequest['approved'] | MaintenanceRequest['requested']): string {
  const normalized = normalizeMaintenanceTransferPayload(payload);
  const parts: string[] = [];
  if (normalized.fuel > 0) {
    parts.push(`${normalized.fuel} deuterium`);
  }
  if (normalized.ships.length > 0) {
    parts.push(normalized.ships.map((entry) => `${entry.type} x${entry.amount}`).join(', '));
  }
  if (normalized.bombs.length > 0) {
    parts.push(normalized.bombs.map((entry) => `${entry.type} x${entry.amount}`).join(', '));
  }

  return parts.length > 0 ? parts.join(' | ') : 'nothing';
}

function expirePendingDiplomaticProposals(galaxy: Galaxy, resolvedTurnNumber: number): void {
  for (const proposal of galaxy.diplomaticProposals) {
    if (
      proposal.state !== DiplomaticProposalState.PENDING
      || proposal.expiresOnTurn > resolvedTurnNumber
    ) {
      continue;
    }

    proposal.state = DiplomaticProposalState.EXPIRED;
  }
}

function isValidSetup(setup: GalaxySetup): boolean {
  const gameTypeValue = (setup as { gameType?: unknown }).gameType;
  const gameTypeValid =
    gameTypeValue === undefined ||
    gameTypeValue === 'PvP' ||
    gameTypeValue === 'PvPvE' ||
    gameTypeValue === 'PvE' ||
    gameTypeValue === 'Sandbox';

  return (
    !!setup &&
    gameTypeValid &&
    typeof setup.galaxyName === 'string' &&
    setup.galaxyName.trim().length > 0 &&
    Number.isInteger(setup.galaxyWidth) &&
    setup.galaxyWidth >= 10 &&
    setup.galaxyWidth <= 100 &&
    Number.isInteger(setup.galaxyHeight) &&
    setup.galaxyHeight >= 10 &&
    setup.galaxyHeight <= 100 &&
    Number.isInteger(setup.galaxyCenterSize) &&
    setup.galaxyCenterSize >= 5 &&
    setup.galaxyCenterSize <= 35 &&
    Number.isInteger(setup.voidChance) &&
    setup.voidChance >= 0 &&
    setup.voidChance <= 35 &&
    Array.isArray(setup.starsAmountModifier) &&
    setup.starsAmountModifier.length === 2 &&
    Number.isInteger(setup.starsAmountModifier[0]) &&
    setup.starsAmountModifier[0] >= -10 &&
    setup.starsAmountModifier[0] <= 0 &&
    Number.isInteger(setup.starsAmountModifier[1]) &&
    setup.starsAmountModifier[1] >= 1 &&
    setup.starsAmountModifier[1] <= 9 &&
    Number.isInteger(setup.playerAmount) &&
    setup.playerAmount >= 1 &&
    setup.playerAmount <= 4 &&
    Number.isInteger(setup.botsAmount) &&
    setup.botsAmount >= 0 &&
    setup.botsAmount <= 12 &&
    Number.isInteger(setup.botDifficulty) &&
    setup.botDifficulty >= -75 &&
    setup.botDifficulty <= 200 &&
    hasExactBotProfileCountMatch(setup.botProfileCounts, setup.botsAmount) &&
    Number.isInteger(setup.neutralBotsAmount) &&
    setup.neutralBotsAmount >= 0 &&
    setup.neutralBotsAmount <= 100 &&
    Number.isInteger(setup.neutralBotsDifficulty) &&
    setup.neutralBotsDifficulty >= -100 &&
    setup.neutralBotsDifficulty <= 200 &&
    Number.isInteger(setup.autoSaveTurns) &&
    setup.autoSaveTurns >= 0 &&
    setup.autoSaveTurns <= MAX_AUTO_SAVE_TURNS &&
    (setup.startingHomeworldPreset === 'Low'
      || setup.startingHomeworldPreset === 'Medium'
      || setup.startingHomeworldPreset === 'High') &&
    (setup.createRandomPlanets === undefined || typeof setup.createRandomPlanets === 'boolean') &&
    (setup.createStartingShips === undefined || typeof setup.createStartingShips === 'boolean') &&
    (setup.skipTutorial === undefined || typeof setup.skipTutorial === 'boolean') &&
    (setup.smokeTestScenario === undefined || isSmokeTestScenarioKey(setup.smokeTestScenario)) &&
    Number.isFinite(setup.startingResources?.metal) &&
    setup.startingResources.metal >= 0 &&
    Number.isFinite(setup.startingResources?.crystal) &&
    setup.startingResources.crystal >= 0 &&
    Number.isFinite(setup.startingResources?.deuterium) &&
    setup.startingResources.deuterium >= 0
  );
}


