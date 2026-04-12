import '@angular/compiler';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SpyLaunchDialogComponent } from './spy-launch-dialog.component';
import type { ClientCoordinates, ClientPlanetDto, CreateFleetMissionResponse, PlayerSession } from '../../../models/game-api-types';
import { PlanetType } from '../../../models/enums/planet-type';
import { PlayerType } from '../../../models/enums/player-type';
import { ShipType } from '../../../models/enums/ship-type';

describe('SpyLaunchDialogComponent', () => {
  it('sorts eligible origin planets by distance to the target', () => {
    const gameApi = {
      getOwnedPlanets: vi.fn().mockReturnValue(of([
        createPlanet('Far', { x: 8, y: 8, z: 8 }, 2),
        createPlanet('Near', { x: 3, y: 3, z: 3 }, 1),
        createPlanet('No Probes', { x: 2, y: 2, z: 2 }, 0),
        createPlanet('Middle', { x: 5, y: 5, z: 5 }, 1)
      ]))
    };
    const component = new SpyLaunchDialogComponent(
      gameApi as never,
      createPlayerSessionService() as never,
      createChangeDetectorRef() as never,
      createI18nService() as never
    );

    component.isOpen = true;
    component.targetPlanet = createForeignPlanet('Target', { x: 4, y: 4, z: 4 });
    component.ngOnChanges({
      isOpen: createSimpleChange(false, true)
    });

    expect((component as { eligibleOrigins: Array<{ planet: ClientPlanetDto }> }).eligibleOrigins.map((entry) => entry.planet.basicInfo.name))
      .toEqual(['Near', 'Middle', 'Far']);
    expect((component as { selectedOriginCoordinates: string }).selectedOriginCoordinates).toBe('3:3:3');
  });

  it('launches spy missions with undamaged probes first and then damaged probes', () => {
    const createFleetMission = vi.fn().mockReturnValue(of({
      ownedPlanets: [],
      activeFleets: [],
      message: 'Spy launched.'
    } satisfies CreateFleetMissionResponse));
    const component = new SpyLaunchDialogComponent(
      {
        getOwnedPlanets: vi.fn().mockReturnValue(of([
          createPlanet('Origin', { x: 2, y: 2, z: 2 }, 3, 2, 1)
        ])),
        createFleetMission
      } as never,
      createPlayerSessionService() as never,
      createChangeDetectorRef() as never,
      createI18nService() as never
    );
    const launched = vi.fn();
    const closed = vi.fn();
    component.launched.subscribe(launched);
    component.closed.subscribe(closed);

    component.isOpen = true;
    component.targetPlanet = createForeignPlanet('Target', { x: 7, y: 7, z: 7 });
    component.ngOnChanges({
      isOpen: createSimpleChange(false, true)
    });

    (component as { probeAmount: number }).probeAmount = 3;
    (component as { launch(): void }).launch();

    expect(createFleetMission).toHaveBeenCalledWith(
      expect.objectContaining({
        ships: [
          {
            type: ShipType.SPY_PROBE,
            undamagedAmount: 2,
            damagedAmount: 1
          }
        ]
      }),
      'token'
    );
    expect(launched).toHaveBeenCalledWith({ message: 'Spy launched.' });
    expect(closed).toHaveBeenCalled();
  });
});

function createPlayerSessionService() {
  return {
    load: vi.fn().mockReturnValue({
      id: 1,
      playerName: 'Player',
      token: 'token',
      localAdmin: true,
      language: 'en',
      tutorialRead: {},
      unreadReportCount: 0,
      unreadMailCount: 0,
      pendingRequestCount: 0
    } satisfies PlayerSession)
  };
}

function createChangeDetectorRef() {
  return {
    markForCheck: vi.fn()
  };
}

function createI18nService() {
  return {
    t: vi.fn((key: string) => key)
  };
}

function createSimpleChange(previousValue: unknown, currentValue: unknown) {
  return {
    previousValue,
    currentValue,
    firstChange: previousValue === undefined,
    isFirstChange: () => previousValue === undefined
  };
}

function createPlanet(
  name: string,
  coordinates: ClientCoordinates,
  totalProbes: number,
  undamagedProbes = totalProbes,
  damagedProbes = Math.max(0, totalProbes - undamagedProbes)
): ClientPlanetDto {
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
      resources: { metal: 0, crystal: 0, deuterium: 0 },
      buildingsLevels: [],
      buildingsCurrentPowerConsumption: [],
      buildingsCurrentStructuralPoints: [],
      defences: { undamagedDefencesCount: {}, damagedDefences: [] },
      ships: {
        undamagedShipsCount: totalProbes > 0 ? { [ShipType.SPY_PROBE]: undamagedProbes } : {},
        damagedShips: Array.from({ length: damagedProbes }, () => ({ type: ShipType.SPY_PROBE, hull: 1 }))
      },
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
    ...createPlanet(name, coordinates, 0),
    info: {
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
