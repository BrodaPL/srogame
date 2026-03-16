import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { GameStateService } from '../../core/game-state.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { Fleet } from '../../models/fleets/fleet';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

@Component({
  selector: 'app-operations-view',
  imports: [TopMenuComponent, RouterLink],
  templateUrl: './operations-view.component.html'
})
export class OperationsViewComponent implements OnInit {
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
    return fleet.ships.reduce((sum, entry) => sum + entry.amount, 0);
  }

  protected shipSummary(fleet: Fleet): string {
    return fleet.ships
      .map((entry) => `${entry.type} x${entry.amount}`)
      .join(', ');
  }

  protected coordinatesLabel(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }

  protected remainingEta(fleet: Fleet): number {
    const currentTurn = this.gameState.currentTurn();
    if (currentTurn === null) {
      return fleet.travelTurns;
    }

    const elapsedTurns = Math.max(0, currentTurn - fleet.createdAtTurn);
    return Math.max(0, fleet.travelTurns - elapsedTurns);
  }

  protected progressLabel(fleet: Fleet): string {
    const currentTurn = this.gameState.currentTurn();
    if (currentTurn === null) {
      return `Travel time ${fleet.travelTurns}`;
    }

    const elapsedTurns = Math.max(0, Math.min(fleet.travelTurns, currentTurn - fleet.createdAtTurn));
    return `${elapsedTurns}/${fleet.travelTurns} turns elapsed`;
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
          this.tutorialService.autoOpenTutorial('operationsView');
        },
        error: () => {
          this.loadError = 'Unable to load active fleets.';
        }
      });
  }
}
