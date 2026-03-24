import { PlayerType } from '../enums/player-type';
import { Player } from '../player';
import { Galaxy } from './galaxy';
import { Planet } from './planet';
import { createTutorialReadState } from '../../tutorial/tutorial-types';

export function nextAvailablePlayerId(galaxy: Galaxy): number {
  return galaxy.players.reduce((maxId, player) => Math.max(maxId, player.playerId), 0) + 1;
}

export function registerPlayerInGalaxy(galaxy: Galaxy, player: Player): void {
  if (!galaxy.players.includes(player)) {
    galaxy.players.push(player);
  }

  if (player.type === PlayerType.PLAYER) {
    galaxy.humanPlayerMap.set(player.playerId, player);
  } else if (player.type === PlayerType.BOT) {
    galaxy.botPlayerMap.set(player.playerId, player);
  } else if (player.type === PlayerType.NEUTRAL) {
    galaxy.neutralPlayerMap.set(player.playerId, player);
  }

  galaxy.playerNameMap.set(player.playerName, player.playerId);
}

export function unregisterPlayerFromGalaxy(galaxy: Galaxy, player: Player): void {
  galaxy.players = galaxy.players.filter((candidate) => candidate !== player);
  galaxy.humanPlayerMap.delete(player.playerId);
  galaxy.botPlayerMap.delete(player.playerId);
  galaxy.neutralPlayerMap.delete(player.playerId);
  galaxy.playerNameMap.delete(player.playerName);
  galaxy.diplomaticRelations = galaxy.diplomaticRelations.filter((relation) =>
    relation.playerAId !== player.playerId && relation.playerBId !== player.playerId
  );
  galaxy.diplomaticProposals = galaxy.diplomaticProposals.filter((proposal) =>
    proposal.fromPlayerId !== player.playerId && proposal.toPlayerId !== player.playerId
  );
}

export function detachPlanetFromOwner(galaxy: Galaxy, planet: Planet): Player | null {
  const previousOwnerId = planet.info.ownerId;
  if (previousOwnerId === null) {
    return null;
  }

  const previousOwner = galaxy.players.find((candidate) => candidate.playerId === previousOwnerId) ?? null;
  planet.info.ownerId = null;
  if (!previousOwner) {
    return null;
  }

  previousOwner.planets = previousOwner.planets.filter((candidate) => candidate !== planet);
  if (previousOwner.planets.length === 0 && previousOwner.type !== PlayerType.PLAYER) {
    unregisterPlayerFromGalaxy(galaxy, previousOwner);
  }

  return previousOwner;
}

export function claimPlanetForPlayer(galaxy: Galaxy, planet: Planet, player: Player): Player | null {
  const previousOwner = detachPlanetFromOwner(galaxy, planet);
  planet.info.ownerId = player.playerId;
  if (!player.planets.includes(planet)) {
    player.planets.push(planet);
  }

  return previousOwner;
}

export function createNeutralOwnerForPlanet(
  galaxy: Galaxy,
  planet: Planet,
  playerNamePrefix = 'N'
): Player {
  const playerId = nextAvailablePlayerId(galaxy);
  const neutralPlayer = new Player(
    playerId,
    `${playerNamePrefix}-${playerId}`,
    [],
    new Map(),
    [],
    PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );

  registerPlayerInGalaxy(galaxy, neutralPlayer);
  claimPlanetForPlayer(galaxy, planet, neutralPlayer);
  return neutralPlayer;
}
