import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { PlayerType } from '../../enums/player-type';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { FleetState } from '../../fleets/fleet';
import { ManyShips } from '../../fleets/many-ships';
import { ShipType } from '../../enums/ship-type';
import { Fleet } from '../../fleets/fleet';
import { Galaxy } from '../../planets/galaxy';
import { Player } from '../../player';
import { ResourcesPack } from '../../resources-pack';
import { SolarSystem } from '../../planets/solar-system';
import { resolvePhaseOneTurn } from '../phase-one-turn-resolver';

function point(x: number, y: number, z: number) {
  return { x, y, z };
}

function manyShips(...entries: Array<{ type: ShipType; amount: number }>): ManyShips {
  const ships = ManyShips.empty();
  for (const entry of entries) {
    ships.addUndamaged(entry.type, entry.amount);
  }

  return ships;
}

describe('resolvePhaseOneTurn colonize integration', () => {
  it('lets Colonize reclaim a passive neutral planet and removes the temporary neutral owner', () => {
    const system = new SolarSystem('Colonize Test', 2, false, false, { x: 4, y: 4 }, new Set<number>(), new Map());
    const originPlanet = system.planets[0];
    const passiveNeutralPlanet = system.planets[1];

    originPlanet.basicInfo.name = 'Alpha Prime';
    originPlanet.info.ownerId = 1;
    passiveNeutralPlanet.basicInfo.name = 'Abandoned Colony';
    passiveNeutralPlanet.info.ownerId = 2;
    passiveNeutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 120, 40);
    passiveNeutralPlanet.rBDSFTQ.ships = manyShips({ type: ShipType.FIGHTER, amount: 2 });

    const player = new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER);
    const neutralOwner = new Player(2, 'N-2', [passiveNeutralPlanet], new Map(), [], PlayerType.NEUTRAL);
    const fleet = new Fleet(
      1,
      1,
      FleetMissionType.COLONIZE,
      point(4, 4, 0),
      point(4, 4, 1),
      'Alpha Prime',
      'Abandoned Colony',
      manyShips({ type: ShipType.COLONIZER, amount: 1 }),
      new ResourcesPack(50, 20, 10),
      0,
      1000,
      80,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      3
    );

    const galaxy = new Galaxy('Colonize Galaxy', [player, neutralOwner], [[system]], 3, [fleet], 2);
    galaxy.humanPlayerMap.set(player.playerId, player);
    galaxy.neutralPlayerMap.set(neutralOwner.playerId, neutralOwner);
    galaxy.playerNameMap.set(player.playerName, player.playerId);
    galaxy.playerNameMap.set(neutralOwner.playerName, neutralOwner.playerId);
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.PASSIVE }
    ];

    resolvePhaseOneTurn(galaxy, 4);

    expect(galaxy.activeFleets).toHaveLength(0);
    expect(passiveNeutralPlanet.info.ownerId).toBe(player.playerId);
    expect(player.planets).toContain(passiveNeutralPlanet);
    expect(galaxy.players.some((candidate) => candidate.playerId === neutralOwner.playerId)).toBe(false);
    expect(galaxy.neutralPlayerMap.has(neutralOwner.playerId)).toBe(false);
    expect(galaxy.diplomaticRelations).toHaveLength(0);
    expect(ManyShips.undamagedCountByType(passiveNeutralPlanet.rBDSFTQ.ships).get(ShipType.COLONIZER) ?? 0).toBe(1);
    expect(ManyShips.undamagedCountByType(passiveNeutralPlanet.rBDSFTQ.ships).get(ShipType.FIGHTER) ?? 0).toBe(2);
    expect(passiveNeutralPlanet.rBDSFTQ.resources.metal).toBe(350);
    expect(passiveNeutralPlanet.rBDSFTQ.resources.crystal).toBe(140);
    expect(passiveNeutralPlanet.rBDSFTQ.resources.deuterium).toBe(50);
  });

  it('fails Colonize when the target is still an ordinary hostile neutral world', () => {
    const system = new SolarSystem('Colonize Failure', 2, false, false, { x: 5, y: 5 }, new Set<number>(), new Map());
    const originPlanet = system.planets[0];
    const hostileNeutralPlanet = system.planets[1];

    originPlanet.info.ownerId = 1;
    hostileNeutralPlanet.info.ownerId = 2;

    const player = new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER);
    const neutralOwner = new Player(2, 'N-2', [hostileNeutralPlanet], new Map(), [], PlayerType.NEUTRAL);
    const fleet = new Fleet(
      2,
      1,
      FleetMissionType.COLONIZE,
      point(5, 5, 0),
      point(5, 5, 1),
      'Alpha Prime',
      'Occupied World',
      manyShips({ type: ShipType.COLONIZER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      1000,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      6
    );

    const galaxy = new Galaxy('Colonize Failure Galaxy', [player, neutralOwner], [[system]], 6, [fleet], 3);

    resolvePhaseOneTurn(galaxy, 7);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.MISSION_FAILURE_RETURNING);
    expect(hostileNeutralPlanet.info.ownerId).toBe(neutralOwner.playerId);
    expect(player.planets).not.toContain(hostileNeutralPlanet);
  });
});
