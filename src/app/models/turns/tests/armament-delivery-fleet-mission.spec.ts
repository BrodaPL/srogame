import { describe, expect, it } from 'vitest';
import { ManyDefences } from '../../defences/many-defences';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { DefenceType } from '../../enums/defence-type';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { FleetState } from '../../fleets/fleet';
import { ManyShips } from '../../fleets/many-ships';
import { ShipType } from '../../enums/ship-type';
import { Fleet } from '../../fleets/fleet';
import { Galaxy } from '../../planets/galaxy';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
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

function manyBombs(...entries: Array<{ type: DefenceType; amount: number }>): ManyDefences {
  const bombs = ManyDefences.empty();
  for (const entry of entries) {
    bombs.addUndamaged(entry.type, entry.amount);
  }

  return bombs;
}

describe('resolvePhaseOneTurn armament delivery integration', () => {
  it('delivers cargo, bombs, and small ships to an allied planet while carriers return', () => {
    const system = new SolarSystem('Armament Delivery Turn', 2, false, false, { x: 7, y: 7 }, new Set<number>(), new Map());
    const originPlanet = system.planets[0];
    const alliedPlanet = system.planets[1];

    originPlanet.basicInfo.name = 'Alpha Prime';
    originPlanet.info.ownerId = 1;
    alliedPlanet.basicInfo.name = 'Beta Prime';
    alliedPlanet.info.ownerId = 2;
    alliedPlanet.rBDSFTQ.resources = new ResourcesPack(25, 10, 5);

    const player = new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER);
    const ally = new Player(2, 'Beta', [alliedPlanet], new Map(), [], PlayerType.PLAYER);
    const fleet = new Fleet(
      22,
      1,
      FleetMissionType.ARMAMENT_DELIVERY,
      point(7, 7, 0),
      point(7, 7, 1),
      'Alpha Prime',
      'Beta Prime',
      manyShips(
        { type: ShipType.CARRIER, amount: 1 },
        { type: ShipType.FIGHTER, amount: 1 }
      ),
      new ResourcesPack(100, 20, 10),
      0,
      400,
      130,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1,
      manyBombs({ type: DefenceType.SMALL_BOMB, amount: 2 })
    );

    const galaxy = new Galaxy('Armament Delivery Galaxy', [player, ally], [[system]], 1, [fleet], 3);
    galaxy.humanPlayerMap.set(player.playerId, player);
    galaxy.humanPlayerMap.set(ally.playerId, ally);
    galaxy.playerNameMap.set(player.playerName, player.playerId);
    galaxy.playerNameMap.set(ally.playerName, ally.playerId);
    galaxy.diplomaticRelations = [{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }];

    resolvePhaseOneTurn(galaxy, 2);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].cargo.getTotalResourceAmount()).toBe(0);
    expect(ManyDefences.totalDefencesCount(galaxy.activeFleets[0].carriedBombs)).toBe(0);
    expect(ManyShips.countByType(galaxy.activeFleets[0].ships).get(ShipType.CARRIER) ?? 0).toBe(1);
    expect(ManyShips.countByType(galaxy.activeFleets[0].ships).get(ShipType.FIGHTER) ?? 0).toBe(0);

    expect((ManyShips.countByType(alliedPlanet.rBDSFTQ.ships).get(ShipType.FIGHTER) ?? 0)).toBe(1);
    expect((ManyShips.countByType(alliedPlanet.rBDSFTQ.ships).get(ShipType.CARRIER) ?? 0)).toBe(0);
    expect((ManyDefences.countByType(alliedPlanet.rBDSFTQ.defences).get(DefenceType.SMALL_BOMB) ?? 0)).toBe(2);
    expect(alliedPlanet.rBDSFTQ.resources.metal).toBeGreaterThanOrEqual(125);
    expect(alliedPlanet.rBDSFTQ.resources.crystal).toBeGreaterThanOrEqual(30);
    expect(alliedPlanet.rBDSFTQ.resources.deuterium).toBeGreaterThanOrEqual(15);
  });
});
