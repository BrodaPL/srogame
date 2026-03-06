import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import type { GalaxyPresentationDataDto } from '../../models/game-api-types';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-galactic-view',
  imports: [TopMenuComponent],
  templateUrl: './galactic-view.component.html'
})
export class GalacticViewComponent implements OnInit {
  protected readonly gridCellSize = 22;
  protected galaxyPresentation: GalaxyPresentationDataDto | null = null;
  protected isLoading = false;
  protected loadError: string | null = null;

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found. Start a new game.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;

    this.gameApi.getGalaxyPresentationData(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.galaxyPresentation = response;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Unable to load galaxy from server.';
          this.cdr.markForCheck();
        }
      });
  }
}
