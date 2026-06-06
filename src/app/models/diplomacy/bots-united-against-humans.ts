import type { GalaxySetup } from '../game-api-types';
import { PlayerType } from '../enums/player-type';
import type { Galaxy } from '../planets/galaxy';
import { DiplomaticStatus } from './diplomatic-status';
import { DiplomacyResolver } from './diplomacy-resolver';

export type BotsUnitedAgainstHumansSetup = Pick<GalaxySetup, 'botsUnitedAgainstHumans'>;

export function isBotsUnitedAgainstHumansEnabled(
  setup: BotsUnitedAgainstHumansSetup | null | undefined
): boolean {
  return setup?.botsUnitedAgainstHumans === true;
}

export function applyBotsUnitedAgainstHumansDiplomacy(
  galaxy: Galaxy,
  setup: BotsUnitedAgainstHumansSetup | null | undefined
): void {
  if (!isBotsUnitedAgainstHumansEnabled(setup)) {
    return;
  }

  const bots = galaxy.players
    .filter((player) => player.type === PlayerType.BOT)
    .sort((left, right) => left.playerId - right.playerId);
  const humans = galaxy.players
    .filter((player) => player.type === PlayerType.PLAYER)
    .sort((left, right) => left.playerId - right.playerId);
  if (bots.length <= 0 || humans.length <= 0) {
    return;
  }

  const resolver = new DiplomacyResolver(galaxy.diplomaticRelations);
  for (let leftIndex = 0; leftIndex < bots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bots.length; rightIndex += 1) {
      resolver.setStatus(bots[leftIndex].playerId, bots[rightIndex].playerId, DiplomaticStatus.ALLIED);
    }
  }

  for (const bot of bots) {
    for (const human of humans) {
      resolver.setStatus(bot.playerId, human.playerId, DiplomaticStatus.WAR);
    }
  }

  galaxy.diplomaticRelations = resolver.toRelations();
}

export function expectedBotsUnitedAgainstHumansStatus(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number,
  setup: BotsUnitedAgainstHumansSetup | null | undefined
): DiplomaticStatus.ALLIED | DiplomaticStatus.WAR | null {
  if (!isBotsUnitedAgainstHumansEnabled(setup)) {
    return null;
  }

  const left = galaxy.players.find((player) => player.playerId === leftPlayerId) ?? null;
  const right = galaxy.players.find((player) => player.playerId === rightPlayerId) ?? null;
  if (!left || !right) {
    return null;
  }

  if (left.type === PlayerType.BOT && right.type === PlayerType.BOT) {
    return DiplomaticStatus.ALLIED;
  }

  const isBotHumanPair = (
    (left.type === PlayerType.BOT && right.type === PlayerType.PLAYER)
    || (left.type === PlayerType.PLAYER && right.type === PlayerType.BOT)
  );
  return isBotHumanPair ? DiplomaticStatus.WAR : null;
}

export function isBotsUnitedAgainstHumansDiplomacyStatusAllowed(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number,
  status: DiplomaticStatus,
  setup: BotsUnitedAgainstHumansSetup | null | undefined
): boolean {
  const expectedStatus = expectedBotsUnitedAgainstHumansStatus(
    galaxy,
    leftPlayerId,
    rightPlayerId,
    setup
  );
  return expectedStatus === null || status === expectedStatus;
}
