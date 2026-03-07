import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import type { GalaxyByteCellDto, GalaxyPresentationDataDto, OwnershipByteCellDto } from '../../models/game-api-types';
import { finalize } from 'rxjs';

type OwnershipKind = 'unknown' | 'empty' | 'owned' | 'human' | 'bot' | 'neutral' | 'mixed';

type GalacticCellVm = {
  x: number;
  y: number;
  isVoid: boolean;
  isCenter: boolean;
  ownershipKind: OwnershipKind;
  tooltip: string;
};

@Component({
  selector: 'app-galactic-view',
  imports: [TopMenuComponent],
  templateUrl: './galactic-view.component.html'
})
export class GalacticViewComponent implements OnInit {
  protected readonly gridCellSize = 22;
  protected galaxyPresentation: GalaxyPresentationDataDto | null = null;
  protected grid: GalacticCellVm[][] = [];
  protected gridWidth = 0;
  protected gridHeight = 0;
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
          this.grid = this.buildGrid(response);
          this.gridHeight = this.grid.length;
          this.gridWidth = this.grid[0]?.length ?? 0;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Unable to load galaxy from server.';
          this.cdr.markForCheck();
        }
      });
  }

  private buildGrid(data: GalaxyPresentationDataDto): GalacticCellVm[][] {
    return data.galaxyBytes.map((row, y) =>
      row.map((cell, x) => {
        const ownershipCell = data.ownershipBytes[y]?.[x] ?? null;
        return this.toCellVm(cell, ownershipCell, x, y);
      })
    );
  }

  private toCellVm(
    galaxyByte: GalaxyByteCellDto,
    ownershipCell: OwnershipByteCellDto | null,
    x: number,
    y: number
  ): GalacticCellVm {
    const planets = galaxyByte.planetsAndAsteroids[0];
    const asteroids = galaxyByte.planetsAndAsteroids[1];
    const isVoid = planets === -1;
    const isCenter = planets === -2;
    const ownership = ownershipCell?.ownership ?? null;
    const ownershipKind = this.resolveOwnershipKind(ownership, isVoid, isCenter);

    return {
      x,
      y,
      isVoid,
      isCenter,
      ownershipKind,
      tooltip: this.buildTooltip(x, y, planets, asteroids, ownership, isVoid, isCenter)
    };
  }

  private resolveOwnershipKind(
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean
  ): OwnershipKind {
    if (isVoid || isCenter || ownership === null) {
      return 'unknown';
    }

    const [ownedByPlayer, neutralOwned, botOwned, humanOwned] = ownership;
    const nonZeroGroups = [ownedByPlayer, neutralOwned, botOwned, humanOwned]
      .filter((value) => value > 0).length;

    if (nonZeroGroups === 0) {
      return 'empty';
    }
    if (nonZeroGroups > 1) {
      return 'mixed';
    }
    if (ownedByPlayer > 0) {
      return 'owned';
    }
    if (humanOwned > 0) {
      return 'human';
    }
    if (botOwned > 0) {
      return 'bot';
    }
    return 'neutral';
  }

  private buildTooltip(
    x: number,
    y: number,
    planets: number,
    asteroids: number,
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean
  ): string {
    if (isVoid) {
      return `${x},${y} | Void`;
    }
    if (isCenter) {
      return `${x},${y} | Galaxy Center`;
    }

    const header = `${x},${y} | Planets: ${planets}, Asteroids: ${asteroids}`;
    if (!ownership) {
      return `${header} | No espionage data`;
    }

    const [ownedByPlayer, neutralOwned, botOwned, humanOwned] = ownership;
    return `${header} | You: ${ownedByPlayer}, Neutral: ${neutralOwned}, Bot: ${botOwned}, Human: ${humanOwned}`;
  }
}
