import '@angular/compiler';
import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { GalacticViewComponent } from './galactic-view.component';
import type {
  ClientCoordinates,
  ClientPlanetDto,
  ClientStarSystemDto,
  GalaxyPresentationDataDto,
  PlayerSession
} from '../../models/game-api-types';
import { PlanetType } from '../../models/enums/planet-type';
import { PlayerType } from '../../models/enums/player-type';

describe('GalacticViewComponent', () => {
  it('selects the route-focused system and highlights the route-focused planet', () => {
    const targetPlanet = createPlanet('Target', { x: 1, y: 0, z: 2 }, false);
    const targetSystem = createStarSystem(targetPlanet);
    const gameApi = {
      getGalaxyPresentationData: vi.fn().mockReturnValue(of(createGalaxyPresentationData())),
      getClientStarSystem: vi.fn().mockReturnValue(of(targetSystem))
    };
    const component = new GalacticViewComponent(
      {
        queryParamMap: of(convertToParamMap({ x: '1', y: '0', z: '2' }))
      } as never,
      gameApi as never,
      {
        load: vi.fn().mockReturnValue(createPlayerSession())
      } as never,
      {
        galaxy: { name: 'Test Galaxy' }
      } as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never
    );

    component.ngOnInit();

    expect((component as { selectedCell: { x: number; y: number } | null }).selectedCell).toMatchObject({
      x: 1,
      y: 0
    });
    expect((component as { selectedPlanetZ: number | null }).selectedPlanetZ).toBe(2);
    expect((component as { isHighlightedPlanet(planet: ClientPlanetDto): boolean }).isHighlightedPlanet(targetPlanet)).toBe(true);
    expect(gameApi.getClientStarSystem).toHaveBeenCalledWith(1, 0, 'token');
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

function createGalaxyPresentationData(): GalaxyPresentationDataDto {
  return {
    galaxyBytes: [
      [
        { planetsAndAsteroids: [1, 0] },
        { planetsAndAsteroids: [1, 0] }
      ]
    ],
    ownershipBytes: [
      [
        { ownership: [1, 0, 0, 0] },
        { ownership: [0, 1, 0, 0] }
      ]
    ],
    ownedPlanets: [createPlanet('Home', { x: 0, y: 0, z: 1 }, true)],
    ownFleetMovements: [],
    starSystemNotes: []
  };
}

function createStarSystem(planet: ClientPlanetDto): ClientStarSystemDto {
  return {
    coordinates: {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: 0
    },
    name: 'Route Focus System',
    isGalaxyCenter: false,
    isVoid: false,
    isCenterEdge: false,
    discoveredByPlayer: [],
    planets: [planet],
    clientInfo: {
      canScan: true,
      canColonize: false,
      canAttack: false
    } as never
  };
}

function createPlanet(name: string, coordinates: ClientCoordinates, ownedByViewer: boolean): ClientPlanetDto {
  return {
    coordinates,
    basicInfo: {
      name,
      type: PlanetType.TERRESTRIAL,
      colonizationDifficulty: 1,
      order: coordinates.z + 1,
      image: '',
      size: 100
    },
    info: {
      isOwnedByViewer: ownedByViewer,
      ownerId: ownedByViewer ? 1 : 2,
      ownerPlayerType: ownedByViewer ? PlayerType.PLAYER : PlayerType.BOT,
      ownerPlayerName: ownedByViewer ? 'Player' : 'Neutral',
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
