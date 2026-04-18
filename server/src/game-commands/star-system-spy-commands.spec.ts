import { describe, expect, it } from 'vitest';
import { Destination } from '../../../src/app/models/fleets/destination.js';
import { Fleet, FleetOrbitActivity, FleetState } from '../../../src/app/models/fleets/fleet.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { PlanetType } from '../../../src/app/models/enums/planet-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { ManyShips } from '../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../src/app/models/player.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import { createStarSystemSpyMissions } from './star-system-spy-commands.js';

describe('star system spy commands', () => {
  it('launches one spy fleet per eligible non-owned, non-asteroid planet', () => {
    const { galaxy, originPlanet } = createStarSystemSpyGalaxy({ availableProbes: 3, deuterium: 24, computerTech: 2 });

    const result = createStarSystemSpyMissions(
      { galaxy, playerId: 1 },
      { systemX: 2, systemY: 3, origin: { x: 2, y: 3, z: 0 } }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.launchedFleetCount).toBe(2);
    expect(result.value.targetPlanets.map((planet) => planet.basicInfo.order)).toEqual([2, 4]);
    expect(galaxy.activeFleets).toHaveLength(2);
    expect(galaxy.activeFleets.every((fleet) => fleet.missionType === FleetMissionType.SPY)).toBe(true);
    expect(galaxy.activeFleets.map((fleet) => fleet.target.z)).toEqual([1, 3]);
    expect(ManyShips.undamagedCountByType(originPlanet.rBDSFTQ.ships).get(ShipType.SPY_PROBE)).toBe(1);
  });

  it('blocks atomically when the origin planet lacks enough probes for the whole system', () => {
    const { galaxy, originPlanet } = createStarSystemSpyGalaxy({ availableProbes: 1, deuterium: 24, computerTech: 2 });

    const result = createStarSystemSpyMissions(
      { galaxy, playerId: 1 },
      { systemX: 2, systemY: 3, origin: { x: 2, y: 3, z: 0 } }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Origin planet needs 2 espionage probes');
    }
    expect(galaxy.activeFleets).toHaveLength(0);
    expect(ManyShips.undamagedCountByType(originPlanet.rBDSFTQ.ships).get(ShipType.SPY_PROBE)).toBe(1);
  });

  it('blocks atomically when there are not enough free fleet slots for the whole system', () => {
    const { galaxy } = createStarSystemSpyGalaxy({ availableProbes: 3, deuterium: 24, computerTech: 0 });
    galaxy.activeFleets.push(
      createExistingFleet(91, { x: 9, y: 9, z: 0 }, { x: 9, y: 9, z: 1 }),
      createExistingFleet(92, { x: 9, y: 9, z: 1 }, { x: 9, y: 9, z: 2 })
    );

    const result = createStarSystemSpyMissions(
      { galaxy, playerId: 1 },
      { systemX: 2, systemY: 3, origin: { x: 2, y: 3, z: 0 } }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('free fleet slots');
    }
    expect(galaxy.activeFleets).toHaveLength(2);
  });
});

function createStarSystemSpyGalaxy(options: {
  availableProbes: number;
  deuterium: number;
  computerTech: number;
}) {
  const system = new SolarSystem('Spy Test', 4, false, false, { x: 2, y: 3 }, new Set<number>(), new Map());
  const [originPlanet, enemyPlanet, asteroidField, neutralPlanet] = system.planets;

  originPlanet.basicInfo.name = 'Alpha Prime';
  originPlanet.basicInfo.type = PlanetType.BARREN;
  originPlanet.info.ownerId = 1;
  originPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, options.deuterium);
  originPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, options.availableProbes);

  enemyPlanet.basicInfo.name = 'Beta Frontier';
  enemyPlanet.basicInfo.type = PlanetType.JUNGLE;
  enemyPlanet.info.ownerId = 2;

  asteroidField.basicInfo.name = 'Spy Test Belt';
  asteroidField.basicInfo.type = PlanetType.ASTEROIDS;
  asteroidField.info.ownerId = null;

  neutralPlanet.basicInfo.name = 'Gamma Fringe';
  neutralPlanet.basicInfo.type = PlanetType.OCEANIC;
  neutralPlanet.info.ownerId = 3;

  const alpha = new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER);
  alpha.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, options.computerTech);
  const beta = new Player(2, 'Beta', [enemyPlanet], new Map(), [], PlayerType.PLAYER);
  const neutral = new Player(3, 'Neutral', [neutralPlanet], new Map(), [], PlayerType.NEUTRAL);
  const stars = Array.from({ length: 4 }, () => Array.from({ length: 3 }, () => SolarSystem.createVoid({ x: 0, y: 0 })));
  stars[3]![2] = system;
  const galaxy = new Galaxy('Spy Galaxy', [alpha, beta, neutral], stars, 7, [], 1);

  return {
    galaxy,
    originPlanet
  };
}

function createExistingFleet(
  fleetId: number,
  origin: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number }
): Fleet {
  const ships = ManyShips.empty();
  ships.addUndamaged(ShipType.SPY_PROBE, 1);
  return new Fleet(
    fleetId,
    1,
    FleetMissionType.SPY,
    new Destination(origin.x, origin.y, origin.z),
    new Destination(target.x, target.y, target.z),
    'Origin',
    'Target',
    ships,
    new ResourcesPack(0, 0, 0),
    1,
    0,
    0,
    1,
    1,
    FleetState.MOVING_TO_TARGET,
    7,
    undefined,
    FleetOrbitActivity.IDLE
  );
}
