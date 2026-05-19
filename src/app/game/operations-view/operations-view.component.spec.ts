import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { OperationsViewComponent } from './operations-view.component';
import type { ClientCoordinates, ClientPlanetDto, PlayerSession } from '../../models/game-api-types';
import { PlanetType } from '../../models/enums/planet-type';
import { PlayerType } from '../../models/enums/player-type';
import { TechnologyType } from '../../models/enums/technology-type';

describe('OperationsViewComponent', () => {
  it('shows active fleet count against the maximum fleet cap', () => {
    const router = createRouter();
    const component = new OperationsViewComponent(
      {} as never,
      {} as never,
      {
        load: vi.fn().mockReturnValue(createPlayerSession())
      } as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never,
      router as never
    );

    (component as { ownedPlanets: ClientPlanetDto[] }).ownedPlanets = [
      createOwnedPlanet('Origin', { x: 1, y: 2, z: 3 }, 2)
    ];
    (component as { activeFleets: Array<unknown> }).activeFleets = [{}, {}, {}];

    expect((component as { activeFleetCountLabel(): string }).activeFleetCountLabel()).toBe('3/6');
  });

  it('navigates to Galaxy View with clicked coordinates', () => {
    const router = createRouter();
    const component = new OperationsViewComponent(
      {} as never,
      {} as never,
      {
        load: vi.fn().mockReturnValue(createPlayerSession())
      } as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never,
      router as never
    );

    (component as { openCoordinatesInGalaxy(coords: ClientCoordinates): void }).openCoordinatesInGalaxy({
      x: 4,
      y: 5,
      z: 6
    });

    expect(router.navigate).toHaveBeenCalledWith(
      ['/game/galactic'],
      {
        queryParams: {
          x: 4,
          y: 5,
          z: 6
        }
      }
    );
  });
});

function createPlayerSession(): PlayerSession {
  return {
    id: 1,
    playerName: 'Player',
    token: 'token',
    localAdmin: true,
    language: 'en',
    tutorialRead: {},
    unreadReportCount: 0,
    unreadMailCount: 0,
    pendingRequestCount: 0,
    currentGameId: null
  };
}

function createRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true)
  };
}

function createOwnedPlanet(name: string, coordinates: ClientCoordinates, computerTechnologyLevel = 0): ClientPlanetDto {
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
      isOwnedByViewer: true,
      ownerId: 1,
      ownerPlayerType: PlayerType.PLAYER,
      ownerPlayerName: 'Player',
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
    reportData: {
      reportId: 1,
      reportType: 'ESPIONAGE' as never,
      createdTurn: 1,
      title: 'Home',
      isRead: true,
      sourceCoordinates: coordinates,
      sourcePlanetName: name,
      sourceSystemName: 'System',
      senderPlayerName: 'Player',
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
      techLevels: [{
        type: TechnologyType.COMPUTER_TECHNOLOGY,
        level: computerTechnologyLevel
      }],
      defences: [],
      ships: [],
      shipyardProduction: {},
      defencesProduction: {},
      researchProduction: {},
      buildingProduction: {}
    }
  };
}
