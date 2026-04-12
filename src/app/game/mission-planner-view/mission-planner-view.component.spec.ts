import '@angular/compiler';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MissionPlannerViewComponent } from './mission-planner-view.component';
import type { ClientCoordinates, ClientPlanetDto, PlayerSession } from '../../models/game-api-types';
import { PlanetType } from '../../models/enums/planet-type';
import { PlayerType } from '../../models/enums/player-type';
import { ShipType } from '../../models/enums/ship-type';

describe('MissionPlannerViewComponent', () => {
  it('prefills the origin planet from query parameters', () => {
    const originPlanet = createOwnedPlanet('Origin', { x: 3, y: 4, z: 5 });
    const fallbackPlanet = createOwnedPlanet('Fallback', { x: 8, y: 9, z: 1 });
    const component = new MissionPlannerViewComponent(
      {
        snapshot: {
          queryParamMap: {
            get: (key: string) => ({
              originX: '3',
              originY: '4',
              originZ: '5'
            }[key] ?? null)
          }
        }
      } as never,
      {
        getOwnedPlanets: vi.fn().mockReturnValue(of([fallbackPlanet, originPlanet])),
        getActiveFleets: vi.fn().mockReturnValue(of([]))
      } as never,
      {
        diplomacyResolver: vi.fn()
      } as never,
      {
        load: vi.fn().mockReturnValue(createPlayerSession())
      } as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never
    );

    component.ngOnInit();

    expect((component as { selectedOriginPlanet: ClientPlanetDto | null }).selectedOriginPlanet?.basicInfo.name).toBe('Origin');
    expect((component as { originCoordinatesInput: string }).originCoordinatesInput).toBe('3:4:5');
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
    pendingRequestCount: 0
  };
}

function createOwnedPlanet(name: string, coordinates: ClientCoordinates): ClientPlanetDto {
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
      resources: { metal: 0, crystal: 0, deuterium: 10 },
      buildingsLevels: [],
      buildingsCurrentPowerConsumption: [],
      buildingsCurrentStructuralPoints: [],
      defences: { undamagedDefencesCount: {}, damagedDefences: [] },
      ships: {
        undamagedShipsCount: { [ShipType.SPY_PROBE]: 1 },
        damagedShips: []
      },
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
      totalShipsAmount: 1,
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
