import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { GameStateService } from '../../core/game-state.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { FleetMissionType } from '../../models/enums/fleet-mission-type';
import { WeaponType } from '../../models/enums/weapon-type';
import { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } from '../../models/fleets/fleet';
import { ManyShips } from '../../models/fleets/many-ships';
import { calculateRepairCapabilityForManyShips } from '../../models/repairs/ship-repair-capability';
import { calculateRecycleCapabilityForManyShips } from '../../models/recycling/recycling-capability';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

@Component({
  selector: 'app-operations-view',
  imports: [TopMenuComponent, RouterLink],
  templateUrl: './operations-view.component.html',
  styleUrl: './operations-view.styles.css'
})
export class OperationsViewComponent implements OnInit {
  protected readonly fleetState = FleetState;
  protected readonly fleetOrbitActivity = FleetOrbitActivity;
  protected readonly fleetReturnReason = FleetReturnReason;
  protected readonly fleetMissionType = FleetMissionType;
  protected isLoading = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected activeFleets: Fleet[] = [];
  protected activeActionFleetId: number | null = null;

  private readonly shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {}

  public ngOnInit(): void {
    this.loadActiveFleets();
  }

  protected totalShips(fleet: Fleet): number {
    // TODO: Distinguish mission-ready vs damaged ships when operations availability gets redesigned.
    return ManyShips.totalShipsCount(fleet.ships);
  }

  protected primaryFleet(): Fleet | null {
    return this.activeFleets[0] ?? null;
  }

  protected shipSummary(fleet: Fleet): string {
    return [...ManyShips.countByType(fleet.ships).entries()]
      .sort(([leftType], [rightType]) => leftType.localeCompare(rightType))
      .map(([type, amount]) => `${type} x${amount}`)
      .join(', ');
  }

  protected coordinatesLabel(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }

  protected currentLocationPlanetName(fleet: Fleet): string {
    if (this.isRecalledInTransit(fleet)) {
      return 'Recalled in transit';
    }

    return this.usesOriginCoordinates(fleet.state) ? fleet.originPlanetName : fleet.targetPlanetName;
  }

  protected currentLocationCoordinates(fleet: Fleet): string {
    if (this.isRecalledInTransit(fleet)) {
      return `${this.coordinatesLabel(fleet.origin.x, fleet.origin.y, fleet.origin.z)} -> ${this.coordinatesLabel(fleet.target.x, fleet.target.y, fleet.target.z)}`;
    }

    const coordinates = this.usesOriginCoordinates(fleet.state) ? fleet.origin : fleet.target;
    return this.coordinatesLabel(coordinates.x, coordinates.y, coordinates.z);
  }

  protected destinationPlanetName(fleet: Fleet): string {
    switch (fleet.state) {
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return fleet.originPlanetName;
      case FleetState.ORBITING:
        return 'Holding position';
      default:
        return fleet.targetPlanetName;
    }
  }

  protected destinationCoordinates(fleet: Fleet): string {
    switch (fleet.state) {
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return this.coordinatesLabel(fleet.origin.x, fleet.origin.y, fleet.origin.z);
      case FleetState.ORBITING:
        return this.currentLocationCoordinates(fleet);
      default:
        return this.coordinatesLabel(fleet.target.x, fleet.target.y, fleet.target.z);
    }
  }

  protected missionLabel(fleet: Fleet): string {
    return fleet.missionType === FleetMissionType.DEFEND ? 'Guard' : fleet.missionType;
  }

  protected stateLabel(fleet: Fleet): string {
    if (fleet.state === FleetState.ORBITING) {
      return `ORBITING | ${this.orbitActivityLabel(fleet.orbitActivity)}`;
    }

    if (fleet.returnReason === FleetReturnReason.MANUAL_RECALL && fleet.state === FleetState.RETURNING) {
      return 'RETURNING | MANUAL RECALL';
    }

    if (fleet.returnReason === FleetReturnReason.MISSION_FAILURE && fleet.state === FleetState.MISSION_FAILURE_RETURNING) {
      return 'MISSION FAILURE RETURNING';
    }

    return fleet.state.replaceAll('_', ' ');
  }

  protected orbitActivityLabel(activity: FleetOrbitActivity): string {
    switch (activity) {
      case FleetOrbitActivity.PASSIVE_HOLD:
        return 'PASSIVE ORBIT';
      case FleetOrbitActivity.GUARDING:
        return 'GUARDING ORBIT';
      default:
        return activity.replaceAll('_', ' ');
    }
  }

  protected canReturn(fleet: Fleet): boolean {
    return fleet.state === FleetState.MOVING_TO_TARGET || fleet.state === FleetState.ORBITING;
  }

  protected canDelay(fleet: Fleet): boolean {
    return fleet.state === FleetState.MOVING_TO_TARGET;
  }

  protected isActionPending(fleet: Fleet): boolean {
    return this.activeActionFleetId === fleet.fleetId;
  }

  protected hasEta(fleet: Fleet): boolean {
    return fleet.state === FleetState.MOVING_TO_TARGET
      || fleet.state === FleetState.RETURNING
      || fleet.state === FleetState.MISSION_FAILURE_RETURNING;
  }

  protected remainingEta(fleet: Fleet): number {
    if (!this.hasEta(fleet)) {
      return 0;
    }

    const currentTurn = this.gameState.currentTurn();
    if (currentTurn === null) {
      return fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns;
    }

    const elapsedTurns = Math.max(0, currentTurn - fleet.createdAtTurn);
    const totalLegTurns = fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns;
    return Math.max(0, totalLegTurns - elapsedTurns);
  }

  protected progressLabel(fleet: Fleet): string {
    if (!this.hasEta(fleet)) {
      return 'No active travel ETA';
    }

    const currentTurn = this.gameState.currentTurn();
    if (currentTurn === null) {
      return `Travel time ${fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns}`;
    }

    const totalLegTurns = fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns;
    const elapsedTurns = Math.max(0, Math.min(totalLegTurns, currentTurn - fleet.createdAtTurn));
    return `${elapsedTurns}/${totalLegTurns} turns elapsed`;
  }

  protected shipRepairCapability(fleet: Fleet): number {
    return calculateRepairCapabilityForManyShips(fleet.ships).shipRepair;
  }

  protected droneRepairCapability(fleet: Fleet): number {
    return calculateRepairCapabilityForManyShips(fleet.ships).droneRepair;
  }

  protected bombardmentCapability(fleet: Fleet): string {
    let shots = 0;
    let damage = 0;

    for (const [shipType, amount] of ManyShips.countByType(fleet.ships).entries()) {
      const blueprint = this.shipBlueprints.get(shipType);
      if (!blueprint) {
        continue;
      }

      for (const weapon of blueprint.weapons) {
        if (weapon.type !== WeaponType.BOMBARDMENT_WEAPONS) {
          continue;
        }

        shots += Math.max(0, weapon.shots) * amount;
        damage += Math.max(0, weapon.dmg) * Math.max(0, weapon.shots) * amount;
      }
    }

    if (shots <= 0) {
      return 'No bombardment weapons';
    }

    return `${shots} shots / ${damage} raw damage`;
  }

  protected operationDetail(fleet: Fleet): string | null {
    if (fleet.missionType === FleetMissionType.SIEGE) {
      return `Siege orbit: ${this.bombardmentCapability(fleet)}`;
    }

    if (fleet.missionType === FleetMissionType.BOMBARD) {
      return `Bombardment pass: ${this.bombardmentCapability(fleet)}`;
    }

    if (fleet.missionType === FleetMissionType.REPAIR) {
      return `Repair support: Ship ${this.shipRepairCapability(fleet)} | Drone ${this.droneRepairCapability(fleet)}`;
    }

    if (fleet.missionType === FleetMissionType.RECYCLE) {
      return `Recycling rate: ${calculateRecycleCapabilityForManyShips(fleet.ships)} / turn`;
    }

    return null;
  }

  protected returnFleet(fleet: Fleet): void {
    if (!this.canReturn(fleet)) {
      return;
    }

    this.runFleetAction(
      fleet.fleetId,
      (token) => this.gameApi.returnFleet(fleet.fleetId, token),
      'Unable to return fleet.'
    );
  }

  protected delayFleet(fleet: Fleet): void {
    if (!this.canDelay(fleet)) {
      return;
    }

    this.runFleetAction(
      fleet.fleetId,
      (token) => this.gameApi.delayFleet(fleet.fleetId, token),
      'Unable to delay fleet.'
    );
  }

  private loadActiveFleets(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.actionError = null;

    this.gameApi.getActiveFleets(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (activeFleets) => {
          this.applyActiveFleetUpdate(activeFleets);
          if (this.activeFleets.length > 0) {
            this.tutorialService.autoOpenTutorial('operationsView');
          }
        },
        error: () => {
          this.loadError = 'Unable to load active fleets.';
        }
      });
  }

  private usesOriginCoordinates(state: FleetState): boolean {
    return state === FleetState.MOVING_TO_TARGET;
  }

  private isRecalledInTransit(fleet: Fleet): boolean {
    return fleet.state === FleetState.RETURNING
      && fleet.returnReason === FleetReturnReason.MANUAL_RECALL
      && fleet.returnTurns < fleet.travelTurns;
  }

  private applyActiveFleetUpdate(activeFleets: Fleet[]): void {
    this.activeFleets = [...activeFleets].sort((left, right) => left.fleetId - right.fleetId);
  }

  private runFleetAction(
    fleetId: number,
    action: (token: string) => ReturnType<GameApiService['getActiveFleets']>,
    fallbackError: string
  ): void {
    const session = this.playerSession.load();
    if (!session || this.activeActionFleetId !== null) {
      return;
    }

    this.activeActionFleetId = fleetId;
    this.actionError = null;

    action(session.token)
      .pipe(finalize(() => {
        this.activeActionFleetId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (activeFleets) => {
          this.applyActiveFleetUpdate(activeFleets);
        },
        error: (error) => {
          this.actionError = error?.error?.error ?? fallbackError;
        }
      });
  }
}
