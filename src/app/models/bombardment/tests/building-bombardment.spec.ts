import { describe, expect, it, vi, afterEach } from 'vitest';
import { applyBuildingBombardment } from '../building-bombardment';
import { BombardmentPriorityTarget } from '../bombardment-priority';
import { ManyDefences } from '../../defences/many-defences';
import { DefenceType } from '../../enums/defence-type';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { PlanetType } from '../../enums/planet-type';
import { BuildingType } from '../../enums/building-type';
import { ManyShips } from '../../fleets/many-ships';
import { SolarSystem } from '../../planets/solar-system';

describe('applyBuildingBombardment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets bombard priorities hit buildings even while planetary defences remain', () => {
    const planet = createTargetPlanet();
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.rBDSFTQ.defences = manyDefences({ type: DefenceType.LIGHT_BEAM_CANNON, amount: 1 });

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.1);

    const summary = applyBuildingBombardment(
      ManyShips.empty(),
      planet,
      manyDefences({ type: DefenceType.MEDIUM_BOMB, amount: 1 }),
      {
        missionType: FleetMissionType.BOMBARD,
        priorities: {
          main: BuildingType.SHIPYARD,
          secondary: BombardmentPriorityTarget.DEFENCES,
          tertiary: null
        }
      }
    );

    expect(summary.buildingTargets.some((target) => target.type === BuildingType.SHIPYARD)).toBe(true);
    expect(summary.defenceTargets).toHaveLength(0);
    expect(planet.getCurrentBuildingStructuralPoints(BuildingType.SHIPYARD)).toBeLessThan(
      planet.getMaxBuildingStructuralPoints(BuildingType.SHIPYARD)
    );
  });

  it('applies the extra siege trigger failure before a planetary bomb can activate', () => {
    const planet = createTargetPlanet();
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);

    vi.spyOn(Math, 'random').mockReturnValueOnce(0.4);

    const summary = applyBuildingBombardment(
      ManyShips.empty(),
      planet,
      manyDefences({ type: DefenceType.MEDIUM_BOMB, amount: 1 }),
      {
        missionType: FleetMissionType.SIEGE,
        priorities: {
          main: BuildingType.SHIPYARD,
          secondary: null,
          tertiary: null
        }
      }
    );

    expect(summary.hits).toBe(0);
    expect(summary.bombsActivated).toBe(0);
    expect(ManyDefences.totalDefencesCount(summary.remainingBombs)).toBe(1);
    expect(planet.getCurrentBuildingStructuralPoints(BuildingType.SHIPYARD)).toBe(
      planet.getMaxBuildingStructuralPoints(BuildingType.SHIPYARD)
    );
  });
});

function createTargetPlanet() {
  const system = new SolarSystem('Test', 1, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
  const planet = system.planets[0];
  planet.basicInfo.type = PlanetType.TERRAN;
  return planet;
}

function manyDefences(...entries: Array<{ type: DefenceType; amount: number }>): ManyDefences {
  const result = ManyDefences.empty();
  for (const entry of entries) {
    result.addUndamaged(entry.type, entry.amount);
  }
  return result;
}
