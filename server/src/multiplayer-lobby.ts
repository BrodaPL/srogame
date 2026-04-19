import * as gameTypeEnumModule from '../../src/app/models/enums/game-type.js';
import * as playerTypeEnumModule from '../../src/app/models/enums/player-type.js';
import * as playerModule from '../../src/app/models/player.js';
import type {
  GameSaveSummary,
  GalaxySetup,
  MultiplayerLobbyDto,
  MultiplayerLobbyLoadSeatDto,
  MultiplayerLobbyMemberDto
} from '../../src/app/models/game-api-types.ts';
import * as gameApiTypesModule from '../../src/app/models/game-api-types.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type { SavedGameFile } from './game-save.js';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { GameType } = resolveModule(gameTypeEnumModule) as typeof import('../../src/app/models/enums/game-type.js');
const { PlayerType } = resolveModule(playerTypeEnumModule) as typeof import('../../src/app/models/enums/player-type.js');
const { defaultBotProfileIdForPlayerId } = resolveModule(playerModule) as typeof import('../../src/app/models/player.js');
const {
  DEFAULT_AUTO_SAVE_TURNS,
  normalizeGalaxySetup
} = resolveModule(gameApiTypesModule) as typeof import('../../src/app/models/game-api-types.js');

export type MultiplayerLobbyMode = 'NEW_GAME' | 'LOAD_SAVE';

export type MultiplayerLobbyMember = {
  accountId: number;
  playerName: string;
  isLocalAdmin: boolean;
  isReady: boolean;
  joinedAt: string;
};

export type MultiplayerLobbyLoadSeat = {
  savedPlayerId: number;
  savedPlayerName: string;
  assignedAccountId: number | null;
};

export type MultiplayerLobbyState = {
  hostAccountId: number;
  hostPlayerName: string;
  mode: MultiplayerLobbyMode;
  isResumeLobby: boolean;
  setup: GalaxySetup;
  members: MultiplayerLobbyMember[];
  boundSaveId: string | null;
  boundSave: GameSaveSummary | null;
  loadSeats: MultiplayerLobbyLoadSeat[];
};

export function createDefaultMultiplayerLobbySetup(): GalaxySetup {
  return normalizeGalaxySetup({
    gameType: GameType.SANDBOX,
    galaxyName: 'Multiplayer Sector',
    galaxyWidth: 25,
    galaxyHeight: 20,
    galaxyCenterSize: 10,
    voidChance: 5,
    starsAmountModifier: [-1, 4],
    playerAmount: 2,
    botsAmount: 0,
    botDifficulty: 0,
    neutralBotsAmount: 10,
    neutralBotsDifficulty: 0,
    autoSaveTurns: DEFAULT_AUTO_SAVE_TURNS,
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    startingResources: {
      metal: 6,
      crystal: 3,
      deuterium: 1
    }
  });
}

export function openMultiplayerLobby(
  hostAccountId: number,
  hostPlayerName: string,
  openedAt: string,
  setup = createDefaultMultiplayerLobbySetup()
): MultiplayerLobbyState {
  return {
    hostAccountId,
    hostPlayerName,
    mode: 'NEW_GAME',
    isResumeLobby: false,
    setup: normalizeGalaxySetup({ ...setup, playerAmount: 2 }),
    members: [{
      accountId: hostAccountId,
      playerName: hostPlayerName,
      isLocalAdmin: true,
      isReady: true,
      joinedAt: openedAt
    }],
    boundSaveId: null,
    boundSave: null,
    loadSeats: []
  };
}

export function joinMultiplayerLobby(
  lobby: MultiplayerLobbyState,
  member: Omit<MultiplayerLobbyMember, 'isReady' | 'joinedAt'>,
  joinedAt: string
): MultiplayerLobbyState {
  if (lobby.members.some((entry) => entry.accountId === member.accountId)) {
    return reconcileLobbyState(lobby);
  }

  return reconcileLobbyState({
    ...lobby,
    members: [...lobby.members, {
      ...member,
      isReady: member.isLocalAdmin,
      joinedAt
    }]
  });
}

export function leaveMultiplayerLobby(
  lobby: MultiplayerLobbyState,
  accountId: number
): MultiplayerLobbyState | null {
  const nextMembers = lobby.members.filter((member) => member.accountId !== accountId);
  if (nextMembers.length === 0) {
    return null;
  }

  const nextHost = nextMembers.find((member) => member.isLocalAdmin) ?? nextMembers[0];
  return reconcileLobbyState({
    ...lobby,
    hostAccountId: nextHost.accountId,
    hostPlayerName: nextHost.playerName,
    members: nextMembers
  });
}

export function setMultiplayerLobbyMemberReady(
  lobby: MultiplayerLobbyState,
  accountId: number,
  ready: boolean
): MultiplayerLobbyState {
  return reconcileLobbyState({
    ...lobby,
    members: lobby.members.map((member) =>
      member.accountId === accountId
        ? { ...member, isReady: member.isLocalAdmin ? true : ready }
        : member
    )
  });
}

export function updateMultiplayerLobbySetup(
  lobby: MultiplayerLobbyState,
  setup: GalaxySetup
): MultiplayerLobbyState {
  return reconcileLobbyState({
    ...lobby,
    setup: normalizeGalaxySetup({
      ...setup,
      playerAmount: Math.max(1, lobby.members.length)
    })
  });
}

export function bindSaveToLobby(
  lobby: MultiplayerLobbyState,
  saveId: string,
  save: SavedGameFile,
  summary: GameSaveSummary
): MultiplayerLobbyState {
  return reconcileLobbyState({
    ...lobby,
    mode: 'LOAD_SAVE',
    setup: normalizeGalaxySetup({
      ...summaryToSetupFallback(summary, save.setup),
      playerAmount: Math.max(1, lobby.members.length)
    }),
    boundSaveId: saveId,
    boundSave: summary,
    loadSeats: save.galaxy.players
      .filter((player) => player.type === PlayerType.PLAYER)
      .map((player) => ({
        savedPlayerId: player.playerId,
        savedPlayerName: player.playerName,
        assignedAccountId: null
      }))
  });
}

export function clearLobbySaveBinding(lobby: MultiplayerLobbyState): MultiplayerLobbyState {
  return reconcileLobbyState({
    ...lobby,
    mode: 'NEW_GAME',
    boundSaveId: null,
    boundSave: null,
    loadSeats: []
  });
}

export function assignLobbyLoadSeat(
  lobby: MultiplayerLobbyState,
  savedPlayerId: number,
  accountId: number | null
): MultiplayerLobbyState {
  return reconcileLobbyState({
    ...lobby,
    loadSeats: lobby.loadSeats.map((seat) =>
      seat.savedPlayerId === savedPlayerId
        ? { ...seat, assignedAccountId: accountId }
        : seat
    )
  });
}

export function reconcileLobbyState(lobby: MultiplayerLobbyState): MultiplayerLobbyState {
  const validMembers = lobby.members.map((member) => ({
    ...member,
    isReady: member.isLocalAdmin ? true : member.isReady
  }));
  const memberById = new Map(validMembers.map((member) => [member.accountId, member]));
  const exactMemberByName = new Map(validMembers.map((member) => [member.playerName, member.accountId]));
  const takenAccounts = new Set<number>();

  const loadSeats = lobby.loadSeats.map((seat) => ({ ...seat, assignedAccountId: null as number | null }));

  for (const seat of loadSeats) {
    const exactAccountId = exactMemberByName.get(seat.savedPlayerName) ?? null;
    if (exactAccountId !== null && !takenAccounts.has(exactAccountId)) {
      seat.assignedAccountId = exactAccountId;
      takenAccounts.add(exactAccountId);
    }
  }

  for (const seat of loadSeats) {
    if (seat.assignedAccountId !== null) {
      continue;
    }

    const originalSeat = lobby.loadSeats.find((entry) => entry.savedPlayerId === seat.savedPlayerId);
    const assignedAccountId = originalSeat?.assignedAccountId ?? null;
    if (
      assignedAccountId !== null
      && memberById.has(assignedAccountId)
      && !takenAccounts.has(assignedAccountId)
    ) {
      seat.assignedAccountId = assignedAccountId;
      takenAccounts.add(assignedAccountId);
    }
  }

  return {
    ...lobby,
    isResumeLobby: lobby.isResumeLobby === true,
    members: validMembers,
    loadSeats
  };
}

export function buildMultiplayerLobbyDto(
  lobby: MultiplayerLobbyState,
  currentAccountId: number | null,
  currentPlayerIsLocalAdmin: boolean
): MultiplayerLobbyDto {
  const startBlockedReason = getMultiplayerLobbyStartBlockedReason(lobby);

  return {
    hostAccountId: lobby.hostAccountId,
    hostPlayerName: lobby.hostPlayerName,
    mode: lobby.mode,
    isResumeLobby: lobby.isResumeLobby === true,
    setup: normalizeGalaxySetup({ ...lobby.setup, playerAmount: Math.max(1, lobby.members.length) }),
    members: lobby.members.map((member): MultiplayerLobbyMemberDto => ({
      accountId: member.accountId,
      playerName: member.playerName,
      isLocalAdmin: member.isLocalAdmin,
      isReady: member.isReady,
      joinedAt: member.joinedAt
    })),
    boundSaveId: lobby.boundSaveId,
    boundSave: lobby.boundSave,
    loadSeats: lobby.loadSeats.map((seat): MultiplayerLobbyLoadSeatDto => {
      const assignedMember = seat.assignedAccountId !== null
        ? lobby.members.find((member) => member.accountId === seat.assignedAccountId) ?? null
        : null;

      return {
        savedPlayerId: seat.savedPlayerId,
        savedPlayerName: seat.savedPlayerName,
        assignedAccountId: seat.assignedAccountId,
        assignedPlayerName: assignedMember?.playerName ?? null,
        assignmentMode: seat.assignedAccountId === null
          ? 'BOT'
          : assignedMember?.playerName === seat.savedPlayerName
            ? 'ORIGINAL'
            : 'REPLACEMENT'
      };
    }),
    canManage: currentPlayerIsLocalAdmin && currentAccountId === lobby.hostAccountId,
    isMember: currentAccountId !== null && lobby.members.some((member) => member.accountId === currentAccountId),
    canJoin: !!currentAccountId && !lobby.members.some((member) => member.accountId === currentAccountId),
    canLeave: !!currentAccountId && lobby.members.some((member) => member.accountId === currentAccountId),
    canToggleReady: !!currentAccountId
      && lobby.members.some((member) => member.accountId === currentAccountId && !member.isLocalAdmin),
    canBindSave: !lobby.isResumeLobby && currentPlayerIsLocalAdmin && currentAccountId === lobby.hostAccountId,
    canEditSetup: !lobby.isResumeLobby && currentPlayerIsLocalAdmin && currentAccountId === lobby.hostAccountId,
    canStart: startBlockedReason === null && currentPlayerIsLocalAdmin && currentAccountId === lobby.hostAccountId,
    startBlockedReason
  };
}

export function getMultiplayerLobbyStartBlockedReason(lobby: MultiplayerLobbyState): string | null {
  if (lobby.members.length < 2) {
    return 'At least two joined players are required.';
  }

  if (lobby.members.some((member) => !member.isLocalAdmin && !member.isReady)) {
    return 'All non-admin players must be ready.';
  }

  if (lobby.mode === 'LOAD_SAVE') {
    if (!lobby.boundSave) {
      return 'Bind a saved game first.';
    }

    const assignedAccounts = new Set(
      lobby.loadSeats
        .map((seat) => seat.assignedAccountId)
        .filter((accountId): accountId is number => accountId !== null)
    );
    const unassignedMembers = lobby.members.filter((member) => !assignedAccounts.has(member.accountId));
    if (unassignedMembers.length > 0) {
      return 'Every joined player must be assigned to a saved human seat or leave the lobby.';
    }
  }

  return null;
}

export function applyLobbyLoadSeatsToGalaxy(
  galaxy: Galaxy,
  lobby: MultiplayerLobbyState
): void {
  const assignments = new Map(
    lobby.loadSeats.map((seat) => [seat.savedPlayerId, seat.assignedAccountId])
  );
  const membersById = new Map(lobby.members.map((member) => [member.accountId, member]));

  for (const player of galaxy.players) {
    if (player.type !== PlayerType.PLAYER) {
      continue;
    }

    const assignedAccountId = assignments.get(player.playerId) ?? null;
    if (assignedAccountId === null) {
      player.type = PlayerType.BOT;
      player.botProfileId = player.botProfileId ?? defaultBotProfileIdForPlayerId(player.playerId);
      player.botMemory = null;
      continue;
    }

    const assignedMember = membersById.get(assignedAccountId);
    if (!assignedMember) {
      player.type = PlayerType.BOT;
      player.botProfileId = player.botProfileId ?? defaultBotProfileIdForPlayerId(player.playerId);
      player.botMemory = null;
      continue;
    }

    player.type = PlayerType.PLAYER;
    player.playerName = assignedMember.playerName;
  }

  rebuildGalaxyPlayerMaps(galaxy);
}

function rebuildGalaxyPlayerMaps(galaxy: Galaxy): void {
  galaxy.humanPlayerMap = new Map();
  galaxy.botPlayerMap = new Map();
  galaxy.neutralPlayerMap = new Map();
  galaxy.playerNameMap = new Map();

  for (const player of galaxy.players) {
    galaxy.playerNameMap.set(player.playerName, player.playerId);
    if (player.type === PlayerType.PLAYER) {
      galaxy.humanPlayerMap.set(player.playerId, player);
      continue;
    }

    if (player.type === PlayerType.BOT) {
      galaxy.botPlayerMap.set(player.playerId, player);
      continue;
    }

    galaxy.neutralPlayerMap.set(player.playerId, player);
  }
}

function summaryToSetupFallback(summary: GameSaveSummary, setup: GalaxySetup): GalaxySetup {
  return normalizeGalaxySetup({
    ...setup,
    galaxyName: summary.galaxyName,
    autoSaveTurns: summary.autoSaveTurns
  });
}
