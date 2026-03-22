import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { GameStateService } from '../../core/game-state.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { Fleet, FleetState } from '../../models/fleets/fleet';
import { ManyShips } from '../../models/fleets/many-ships';
import { calculateRepairCapabilityForManyShips } from '../../models/repairs/ship-repair-capability';
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
  protected isLoading = false;
  protected loadError: string | null = null;
  protected activeFleets: Fleet[] = [];

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
    return this.usesOriginCoordinates(fleet.state) ? fleet.originPlanetName : fleet.targetPlanetName;
  }

  protected currentLocationCoordinates(fleet: Fleet): string {
    const coordinates = this.usesOriginCoordinates(fleet.state) ? fleet.origin : fleet.target;
    return this.coordinatesLabel(coordinates.x, coordinates.y, coordinates.z);
  }

  protected destinationPlanetName(fleet: Fleet): string {
    switch (fleet.state) {
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return fleet.originPlanetName;
      case FleetState.IDLE:
      case FleetState.MISSION_FAILURE_IDLE:
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
      case FleetState.IDLE:
      case FleetState.MISSION_FAILURE_IDLE:
        return this.currentLocationCoordinates(fleet);
      default:
        return this.coordinatesLabel(fleet.target.x, fleet.target.y, fleet.target.z);
    }
  }

  protected stateLabel(fleet: Fleet): string {
    return fleet.state.replaceAll('_', ' ');
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

  private loadActiveFleets(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;

    this.gameApi.getActiveFleets(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (activeFleets) => {
          this.activeFleets = [...activeFleets].sort((left, right) => left.fleetId - right.fleetId);
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
    return state === FleetState.MOVING_TO_TARGET || state === FleetState.MISSION_FAILURE_IDLE;
  }
}
