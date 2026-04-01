import { SpaceBattleResolver } from '../battles/space-battle-resolver';
import { FleetMissionType } from '../enums/fleet-mission-type';
import { ShipType } from '../enums/ship-type';
import { FleetState } from '../fleets/fleet';
import type { Fleet } from '../fleets/fleet';
import { FleetReport } from '../reports/fleet-report';
import type { Ship } from '../fleets/ship';
import type { FleetMissionBlueprint } from './fleet-mission-blueprint';
import type { MissionCheck } from './mission-check';
import type {
  MissionPlannerContext,
  MissionLaunchContext,
  MissionSelection,
  MissionSelectionContext,
  MissionResolutionContext,
  MissionReportContext
} from './mission-context';
import { cargoAmount, resolveTargetDiplomaticStatus } from './mission-context';
import type { EncounterLocation } from './encounters/encounter-location';
import type { FleetEncounterOutcome } from './encounters/encounter-outcome';
import type { MissionResolutionResult } from './mission-effect';

type CommonChecksContext = {
  totalSelectedShips: number;
  totalCargoCapacity: number;
  usedCargoCapacity: number;
  totalHangarCapacity: number;
  usedHangarCapacity: number;
  hasMilitaryShips: boolean;
  activeFleetCount: number;
  maxActiveFleetCount: number;
  availableDeuterium: number | null;
  fuelCost: number;
  targetOwnerId: number | null;
  playerOwnerId: number | null;
  targetSelected: boolean;
  originSelected: boolean;
  selection: MissionSelection;
  diplomacyResolver?: MissionPlannerContext['diplomacyResolver'] | MissionLaunchContext['diplomacyResolver'];
};

export class FleetMission {
  constructor(public readonly blueprint: FleetMissionBlueprint) {}

  public get missionType() {
    return this.blueprint.type;
  }

  public get name(): string {
    return this.blueprint.name;
  }

  public get description(): string {
    return this.blueprint.description;
  }

  public get minimumFuelReserves(): number {
    return this.blueprint.minimumFuelReserves;
  }

  public getBattleRounds(baseRounds = SpaceBattleResolver.DEFAULT_MAX_ROUNDS): number {
    return Math.max(1, baseRounds + this.blueprint.battleRoundsModifier);
  }

  public normalizeSelection(context: MissionSelectionContext): MissionSelection {
    return {
      ships: context.selection.ships.map((entry) => ({ ...entry })),
      carriedBombs: context.selection.carriedBombs.map((entry) => ({ ...entry })),
      cargo: this.blueprint.shipRules.allowCargo
        ? { ...context.selection.cargo }
        : { metal: 0, crystal: 0, deuterium: 0 }
    };
  }

  public getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    return this.getCommonChecks({
      totalSelectedShips: context.totalSelectedShips,
      totalCargoCapacity: context.totalCargoCapacity,
      usedCargoCapacity: context.usedCargoCapacity,
      totalHangarCapacity: context.totalHangarCapacity,
      usedHangarCapacity: context.usedHangarCapacity,
      hasMilitaryShips: context.hasMilitaryShips,
      activeFleetCount: context.activeFleetCount,
      maxActiveFleetCount: context.maxActiveFleetCount,
      availableDeuterium: context.availableDeuterium,
      fuelCost: context.fuelCost,
      targetOwnerId: context.selectedTargetPlanet?.info.ownerId ?? null,
      playerOwnerId: context.selectedOriginPlanet?.info.ownerId ?? null,
      targetSelected: context.selectedTargetPlanet !== null,
      originSelected: context.selectedOriginPlanet !== null,
      selection: context.selection,
      diplomacyResolver: context.diplomacyResolver ?? null
    });
  }

  public validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    return this.getCommonChecks({
      totalSelectedShips: context.selection.ships.reduce((total, entry) => total + entry.undamagedAmount + entry.damagedAmount, 0),
      totalCargoCapacity: context.totalCargoCapacity,
      usedCargoCapacity: context.usedCargoCapacity,
      totalHangarCapacity: context.totalHangarCapacity,
      usedHangarCapacity: context.usedHangarCapacity,
      hasMilitaryShips: context.hasMilitaryShips,
      activeFleetCount: context.activeFleetCount,
      maxActiveFleetCount: context.maxActiveFleetCount,
      availableDeuterium: context.originPlanet.rBDSFTQ.resources.deuterium,
      fuelCost: context.fuelCost,
      targetOwnerId: context.targetPlanet.info.ownerId,
      playerOwnerId: context.playerId,
      targetSelected: true,
      originSelected: true,
      selection: context.selection,
      diplomacyResolver: context.diplomacyResolver ?? null
    }).filter((check) => check.severity === 'error');
  }

  public createEncounterLocation(context: MissionLaunchContext): EncounterLocation | null {
    const firstKind = this.blueprint.encounterLocationKinds[0];
    if (!firstKind) {
      return null;
    }

    if (firstKind === 'planetOrbit') {
      const coordinates = context.targetPlanet.basicInfo.solarSystem.coordinates;
      return {
        kind: 'planetOrbit',
        x: coordinates.x,
        y: coordinates.y,
        z: Math.max(0, context.targetPlanet.basicInfo.order - 1)
      };
    }

    return {
      kind: 'starSystem',
      x: context.targetPlanet.basicInfo.solarSystem.coordinates.x,
      y: context.targetPlanet.basicInfo.solarSystem.coordinates.y
    };
  }

  public getEncounterLocationForFleet(fleet: Fleet): EncounterLocation | null {
    const firstKind = this.blueprint.encounterLocationKinds[0];
    if (!firstKind) {
      return null;
    }

    if (firstKind === 'planetOrbit') {
      return {
        kind: 'planetOrbit',
        x: fleet.target.x,
        y: fleet.target.y,
        z: fleet.target.z
      };
    }

    return {
      kind: 'starSystem',
      x: fleet.target.x,
      y: fleet.target.y
    };
  }

  public participatesInEncounter(): boolean {
    return true;
  }

  public isShipRelevant(_shipType: ShipType, _ship: Ship): boolean {
    return true;
  }

  public isShipRequired(shipType: ShipType): boolean {
    return this.blueprint.shipRules.requiredShipTypes.includes(shipType);
  }

  public resolveWithoutEncounter(_context: MissionResolutionContext): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      effects: [],
      reports: []
    };
  }

  public resolveAfterEncounter(
    context: MissionResolutionContext,
    _outcome: FleetEncounterOutcome
  ): MissionResolutionResult {
    return this.resolveWithoutEncounter(context);
  }

  public resolveIdleTurn(_context: MissionResolutionContext): MissionResolutionResult | null {
    return null;
  }

  public onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: []
    };
  }

  protected buildSuccessReport(context: MissionReportContext, body: string): FleetReport {
    return new FleetReport(
      {
        reportId: context.player.createReportId(),
        createdTurn: context.resolvedTurnNumber,
        title: `Fleet Arrived: ${context.fleet.missionType} to ${context.fleet.targetPlanetName}`,
        sourceCoordinates: { ...context.fleet.target },
        sourcePlanetName: context.fleet.targetPlanetName,
        senderPlayerName: context.player.playerName
      },
      body
    );
  }

  protected buildFailureReport(context: MissionReportContext, body: string): FleetReport {
    return new FleetReport(
      {
        reportId: context.player.createReportId(),
        createdTurn: context.resolvedTurnNumber,
        title: `Fleet Failed: ${context.fleet.missionType} to ${context.fleet.targetPlanetName}`,
        sourceCoordinates: { ...context.fleet.target },
        sourcePlanetName: context.fleet.targetPlanetName,
        senderPlayerName: context.player.playerName
      },
      body
    );
  }

  protected buildDrawReport(context: MissionReportContext, body: string): FleetReport {
    return new FleetReport(
      {
        reportId: context.player.createReportId(),
        createdTurn: context.resolvedTurnNumber,
        title: `Fleet Draw: ${context.fleet.missionType} at ${context.fleet.targetPlanetName}`,
        sourceCoordinates: { ...context.fleet.target },
        sourcePlanetName: context.fleet.targetPlanetName,
        senderPlayerName: context.player.playerName
      },
      body
    );
  }

  protected getCommonChecks(context: CommonChecksContext): MissionCheck[] {
    const checks: MissionCheck[] = [];

    if (!context.originSelected) {
      checks.push({ text: 'Select origin planet.', severity: 'error' });
    }

    if (!context.targetSelected) {
      checks.push({ text: 'Select or resolve target planet.', severity: 'error' });
    }

    if (context.totalSelectedShips <= 0) {
      checks.push({ text: 'Select at least one ship.', severity: 'error' });
    }

    if (context.usedCargoCapacity > context.totalCargoCapacity) {
      checks.push({ text: 'Insufficient cargo space.', severity: 'error' });
    }

    if (context.usedHangarCapacity > context.totalHangarCapacity) {
      checks.push({ text: 'Insufficient hangar space.', severity: 'error' });
    }

    if (context.activeFleetCount >= context.maxActiveFleetCount) {
      checks.push({
        text: `Active fleet limit reached (${context.activeFleetCount}/${context.maxActiveFleetCount}). Upgrade COMPUTER_TECHNOLOGY to control more fleets.`,
        severity: 'error'
      });
    }

    const selectedCargoAmount = cargoAmount(context.selection.cargo);
    if (!this.blueprint.shipRules.allowCargo && selectedCargoAmount > 0) {
      checks.push({ text: `${this.name} mission cannot carry cargo.`, severity: 'error' });
    }

    if (this.blueprint.shipRules.requiresCargo && selectedCargoAmount <= 0) {
      checks.push({ text: `${this.name} mission requires cargo.`, severity: 'error' });
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.playerOwnerId,
      context.targetOwnerId,
      context.diplomacyResolver ?? null
    );
    if (context.targetSelected && context.targetOwnerId === null && !this.blueprint.targetRules.allowUnowned) {
      checks.push({ text: `${this.name} mission target cannot be unowned.`, severity: 'error' });
    }

    if (
      context.targetSelected
      && targetStatus !== null
      && !this.blueprint.targetRules.allowedDiplomaticStatuses.includes(targetStatus)
    ) {
      checks.push({ text: `${this.name} mission target ownership is not valid.`, severity: 'error' });
    }

    const selectedShipTypes = context.selection.ships
      .filter((entry) => entry.undamagedAmount > 0 || entry.damagedAmount > 0)
      .map((entry) => entry.type);

    for (const requiredType of this.blueprint.shipRules.requiredShipTypes) {
      if (!selectedShipTypes.includes(requiredType)) {
        checks.push({ text: `${requiredType} is required for ${this.name} mission.`, severity: 'error' });
      }
    }

    if (this.blueprint.shipRules.exclusiveShipTypes.length > 0) {
      const invalidShip = selectedShipTypes.find((shipType) => !this.blueprint.shipRules.exclusiveShipTypes.includes(shipType));
      if (invalidShip) {
        checks.push({
          text: `${this.name} mission accepts only ${this.blueprint.shipRules.exclusiveShipTypes.join(', ')}.`,
          severity: 'error'
        });
      }
    }

    if (!context.hasMilitaryShips && this.missionType !== FleetMissionType.SPY) {
      checks.push({ text: 'No military ship has been assigned!', severity: 'note' });
    }

    if (context.totalHangarCapacity > 0 || context.usedHangarCapacity > 0) {
      checks.push({
        text: `Hangar capacity remaining: ${Math.max(0, context.totalHangarCapacity - context.usedHangarCapacity)}.`,
        severity: 'note'
      });
    }

    if (context.availableDeuterium !== null && context.availableDeuterium < (context.selection.cargo.deuterium + context.fuelCost)) {
      checks.push({ text: 'Insufficient deuterium for cargo and fuel.', severity: 'error' });
    }

    return checks;
  }
}
