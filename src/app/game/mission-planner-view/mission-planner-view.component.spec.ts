import '@angular/compiler';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MissionPlannerViewComponent } from './mission-planner-view.component';
import type { ClientCoordinates, ClientPlanetDto, PlayerSession } from '../../models/game-api-types';
import { PlanetType } from '../../models/enums/planet-type';
import { PlayerType } from '../../models/enums/player-type';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';

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
      } as never,
      {
        t: vi.fn((key: string) => key)
      } as never
    );

    component.ngOnInit();

    expect((component as { selectedOriginPlanet: ClientPlanetDto | null }).selectedOriginPlanet?.basicInfo.name).toBe('Origin');
    expect((component as { originCoordinatesInput: string }).originCoordinatesInput).toBe('3:4:5');
  });

  it('shows active fleet count against the maximum fleet cap', () => {
    const component = new MissionPlannerViewComponent(
      {
        snapshot: {
          queryParamMap: {
            get: () => null
          }
        }
      } as never,
      {
        getOwnedPlanets: vi.fn().mockReturnValue(of([])),
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
      } as never,
      {
        t: vi.fn((key: string) => key)
      } as never
    );

    (component as { ownedPlanets: ClientPlanetDto[] }).ownedPlanets = [
      createOwnedPlanet('Origin', { x: 3, y: 4, z: 5 }, { computerTechnologyLevel: 2 })
    ];
    (component as { activeFleets: Array<unknown> }).activeFleets = [{}, {}, {}];

    expect((component as { activeFleetCountLabel(): string }).activeFleetCountLabel()).toBe('3/6');
  });

  it('applies drive technologies to the travel-time preview and keeps Jump Gate at one turn', () => {
    const component = new MissionPlannerViewComponent(
      {
        snapshot: {
          queryParamMap: {
            get: () => null
          }
        }
      } as never,
      {
        getOwnedPlanets: vi.fn().mockReturnValue(of([])),
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
      } as never,
      {
        t: vi.fn((key: string) => key)
      } as never
    );

    const originPlanet = createOwnedPlanet('Origin', { x: 1, y: 1, z: 1 }, {
      computerTechnologyLevel: 0,
      fusionDriveLevel: 4,
      hyperspaceDriveLevel: 10,
      gravitonTechnologyLevel: 2
    });
    const targetPlanet = createOwnedPlanet('Target', { x: 7, y: 1, z: 1 });

    (component as { selectedOriginPlanet: ClientPlanetDto | null }).selectedOriginPlanet = originPlanet;
    (component as { selectedTargetPlanet: ClientPlanetDto | null }).selectedTargetPlanet = targetPlanet;
    (component as { undamagedShipSelectionByType: Map<ShipType, number> }).undamagedShipSelectionByType.set(ShipType.FIGHTER, 1);

    expect((component as { travelTurnsPreview(): number }).travelTurnsPreview()).toBe(2);
    expect((component as { travelFormulaLabel(): string }).travelFormulaLabel()).toBe(
      'ETA formula: ceil((4 / (1 + Fusion Drive / 3) + distance / (1 + Hyperspace Drive / 6) - Graviton Technology) * ship modifier)'
    );
    expect((component as { travelFormulaDetailLabel(): string }).travelFormulaDetailLabel()).toBe(
      'Current: ceil((1.71 + 2.25 - 2) * 0.6) = 2 turns'
    );
    expect((component as { travelShipModifierSummaryLabel(): string }).travelShipModifierSummaryLabel()).toBe(
      'Fleet speed modifier: slowest selected ship applies -40% to the full ETA.'
    );
    expect((component as { travelTechSummaryLabel(): string }).travelTechSummaryLabel()).toBe(
      'Tech levels: Fusion Drive 4 | Hyperspace Drive 10 | Graviton Technology 2'
    );

    (component as { useJumpGate: boolean }).useJumpGate = true;

    expect((component as { travelTurnsPreview(): number }).travelTurnsPreview()).toBe(1);
    expect((component as { travelFormulaLabel(): string }).travelFormulaLabel()).toBe(
      'Jump Gate override: travel time is fixed at 1 turn.'
    );
    expect((component as { travelFormulaDetailLabel(): string }).travelFormulaDetailLabel()).toBe(
      'Drive technologies do not change Jump Gate travel time.'
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
    pendingRequestCount: 0
  };
}

function createOwnedPlanet(
  name: string,
  coordinates: ClientCoordinates,
  technologyLevels: {
    computerTechnologyLevel?: number;
    fusionDriveLevel?: number;
    hyperspaceDriveLevel?: number;
    gravitonTechnologyLevel?: number;
  } = {}
): ClientPlanetDto {
  const {
    computerTechnologyLevel = 0,
    fusionDriveLevel = 0,
    hyperspaceDriveLevel = 0,
    gravitonTechnologyLevel = 0
  } = technologyLevels;

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
      spaceDebrisAmount: { metal: 0, crystal: 0, deuterium: 0 },
      techLevels: [
        {
          type: TechnologyType.COMPUTER_TECHNOLOGY,
          level: computerTechnologyLevel
        },
        {
          type: TechnologyType.FUSION_DRIVE,
          level: fusionDriveLevel
        },
        {
          type: TechnologyType.HYPERSPACE_DRIVE,
          level: hyperspaceDriveLevel
        },
        {
          type: TechnologyType.GRAVITON_TECHNOLOGY,
          level: gravitonTechnologyLevel
        }
      ],
      defences: [],
      ships: [],
      shipyardProduction: {},
      defencesProduction: {},
      researchProduction: {},
      buildingProduction: {}
    }
  };
}
