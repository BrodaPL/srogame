import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { MiniPlanetPreviewComponent } from './mini-planet-preview.component';
import type { ClientCoordinates, ClientPlanetDto } from '../../../models/game-api-types';
import { PlanetType } from '../../../models/enums/planet-type';
import { PlayerType } from '../../../models/enums/player-type';

describe('MiniPlanetPreviewComponent', () => {
  it('shows spy action only for non-owned planets', () => {
    const component = new MiniPlanetPreviewComponent(createRouter() as never);

    component.planet = createPlanet('Owned', { x: 1, y: 1, z: 1 }, 5);
    expect((component as { showSpyAction(): boolean }).showSpyAction()).toBe(false);
    expect((component as { canUseAsMissionOrigin(): boolean }).canUseAsMissionOrigin()).toBe(true);

    component.planet = createForeignPlanet('Foreign', { x: 2, y: 2, z: 2 });
    expect((component as { showSpyAction(): boolean }).showSpyAction()).toBe(true);
    expect((component as { canUseAsMissionOrigin(): boolean }).canUseAsMissionOrigin()).toBe(false);
  });

  it('does not treat a revealed foreign owner as viewer-owned', () => {
    const router = createRouter();
    const component = new MiniPlanetPreviewComponent(router as never);

    component.planet = createRevealedForeignPlanet('Foreign', { x: 4, y: 4, z: 4 });

    expect((component as { canViewPlanet(): boolean }).canViewPlanet()).toBe(false);
    expect((component as { isPlayerOwnedPlanet(): boolean }).isPlayerOwnedPlanet()).toBe(false);
    expect((component as { isHumanOwnedPlanet(): boolean }).isHumanOwnedPlanet()).toBe(true);
    expect((component as { canUseAsMissionOrigin(): boolean }).canUseAsMissionOrigin()).toBe(false);

    (component as { openPlanetView(): void }).openPlanetView();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates to Mission Planner with origin or target prefills', () => {
    const router = createRouter();
    const component = new MiniPlanetPreviewComponent(router as never);

    component.planet = createPlanet('Owned', { x: 5, y: 6, z: 7 }, 1);
    (component as { openMissionPlannerAsOrigin(): void }).openMissionPlannerAsOrigin();
    (component as { openMissionPlannerAsTarget(): void }).openMissionPlannerAsTarget();

    expect(router.navigate).toHaveBeenNthCalledWith(
      1,
      ['/game/mission-planner'],
      {
        queryParams: {
          originX: 5,
          originY: 6,
          originZ: 7
        }
      }
    );
    expect(router.navigate).toHaveBeenNthCalledWith(
      2,
      ['/game/mission-planner'],
      {
        queryParams: {
          targetX: 5,
          targetY: 6,
          targetZ: 7
        }
      }
    );
  });
});

function createRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true)
  };
}

function createPlanet(name: string, coordinates: ClientCoordinates, ownerId: number | null): ClientPlanetDto {
  return {
    coordinates,
    basicInfo: {
      name,
      type: PlanetType.TERRESTRIAL,
      colonizationDifficulty: 1,
      order: 1,
      image: '',
      size: 100
    },
    info: {
      isOwnedByViewer: ownerId !== null,
      ownerId,
      ownerPlayerType: PlayerType.PLAYER,
      ownerPlayerName: ownerId !== null ? 'Player' : null,
      planetaryParameters: {
        metalModifier: 100,
        crystalModifier: 100,
        deuteriumModifier: 100,
        energyModifierRES: 100,
        energyModifierNuclear: 100,
        scienceModifier: 100,
        industryModifier: 100,
        anomaliesAndNoise: 0,
        hyperspaceParameters: 100
      }
    },
    objects: {
      resources: { metal: 0, crystal: 0, deuterium: 0 },
      buildingsLevels: [],
      buildingsCurrentPowerConsumption: [],
      buildingsCurrentStructuralPoints: [],
      defences: { undamagedDefencesCount: {}, damagedDefences: [] },
      ships: { undamagedShipsCount: {}, damagedShips: [] },
      currentResearchQueue: null,
      researchHelperFor: null,
      buildingQueue: [],
      shipyardQueue: [],
      fleets: [],
      spaceDebris: { metal: 0, crystal: 0, deuterium: 0 },
      tradePortOffers: []
    },
    reportData: null
  };
}

function createForeignPlanet(name: string, coordinates: ClientCoordinates): ClientPlanetDto {
  return {
    ...createPlanet(name, coordinates, null),
    info: {
      isOwnedByViewer: false,
      ownerId: null,
      ownerPlayerType: PlayerType.BOT,
      ownerPlayerName: 'Enemy',
      planetaryParameters: {
        metalModifier: 100,
        crystalModifier: 100,
        deuteriumModifier: 100,
        energyModifierRES: 100,
        energyModifierNuclear: 100,
        scienceModifier: 100,
        industryModifier: 100,
        anomaliesAndNoise: 0,
        hyperspaceParameters: 100
      }
    }
  };
}

function createRevealedForeignPlanet(name: string, coordinates: ClientCoordinates): ClientPlanetDto {
  return {
    ...createPlanet(name, coordinates, null),
    info: {
      isOwnedByViewer: false,
      ownerId: 9,
      ownerPlayerType: PlayerType.PLAYER,
      ownerPlayerName: 'Enemy',
      planetaryParameters: {
        metalModifier: 100,
        crystalModifier: 100,
        deuteriumModifier: 100,
        energyModifierRES: 100,
        energyModifierNuclear: 100,
        scienceModifier: 100,
        industryModifier: 100,
        anomaliesAndNoise: 0,
        hyperspaceParameters: 100
      }
    },
    reportData: {
      reportId: 1,
      reportType: 'ESPIONAGE' as never,
      createdTurn: 1,
      title: 'Intel',
      isRead: true,
      sourceCoordinates: coordinates,
      sourcePlanetName: name,
      sourceSystemName: 'System',
      senderPlayerName: 'Scout',
      planetaryParameters: {
        metalModifier: 100,
        crystalModifier: 100,
        deuteriumModifier: 100,
        energyModifierRES: 100,
        energyModifierNuclear: 100,
        scienceModifier: 100,
        industryModifier: 100,
        anomaliesAndNoise: 0,
        hyperspaceParameters: 100
      },
      averageBuildingLevel: 0,
      averageTotalResources: 0,
      averageTechLevel: 0,
      totalDefencesAmount: 0,
      totalShipsAmount: 0,
      buildingsLevels: [],
      resourcesAmount: { metal: 0, crystal: 0, deuterium: 0 },
      techLevels: [],
      defences: [],
      ships: [],
      shipyardProduction: {},
      defencesProduction: {},
      researchProduction: {},
      buildingProduction: {}
    }
  };
}
