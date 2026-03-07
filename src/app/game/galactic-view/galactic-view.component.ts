import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild
} from '@angular/core';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import type {
  GalaxyByteCellDto,
  GalaxyPresentationDataDto,
  OwnershipByteCellDto,
  GalaxySetup
} from '../../models/game-api-types';
import { finalize } from 'rxjs';
import { GameStateService } from '../../core/game-state.service';

type CellFillKind =
  | 'void'
  | 'center'
  | 'noData'
  | 'neutralOnly'
  | 'playerOnly'
  | 'botOrNeutral'
  | 'humanOrNeutral'
  | 'humanBotAnyNeutral'
  | 'playerAndEnemyAnyNeutral';

type GalacticCellVm = {
  x: number;
  y: number;
  isVoid: boolean;
  isCenter: boolean;
  fillKind: CellFillKind;
  valueLabel: string;
  ownedPlanetsDotsLabel: string;
  coordsLabel: string;
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
  protected galaxyName: string | null = null;
  protected topScrollContentWidth = 0;
  protected isLoading = false;
  protected loadError: string | null = null;
  @ViewChild('topScroll') private topScrollRef?: ElementRef<HTMLDivElement>;
  @ViewChild('bottomScroll') private bottomScrollRef?: ElementRef<HTMLDivElement>;
  private isSyncingScroll = false;

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly gameState: GameStateService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    this.galaxyName = this.resolveGalaxyName();

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
          this.syncScrollbars();
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Unable to load galaxy from server.';
          this.cdr.markForCheck();
        }
      });
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.syncScrollbars();
  }

  protected onTopScrollbarScroll(): void {
    if (this.isSyncingScroll) {
      return;
    }

    const top = this.topScrollRef?.nativeElement;
    const bottom = this.bottomScrollRef?.nativeElement;
    if (!top || !bottom) {
      return;
    }

    this.isSyncingScroll = true;
    bottom.scrollLeft = top.scrollLeft;
    this.isSyncingScroll = false;
  }

  protected onBottomScrollbarScroll(): void {
    if (this.isSyncingScroll) {
      return;
    }

    const top = this.topScrollRef?.nativeElement;
    const bottom = this.bottomScrollRef?.nativeElement;
    if (!top || !bottom) {
      return;
    }

    this.isSyncingScroll = true;
    top.scrollLeft = bottom.scrollLeft;
    this.isSyncingScroll = false;
  }

  private syncScrollbars(): void {
    setTimeout(() => {
      const top = this.topScrollRef?.nativeElement;
      const bottom = this.bottomScrollRef?.nativeElement;
      if (!top || !bottom) {
        return;
      }

      this.topScrollContentWidth = bottom.scrollWidth;
      top.scrollLeft = bottom.scrollLeft;
      this.cdr.markForCheck();
    }, 0);
  }

  private resolveGalaxyName(): string | null {
    const stateGalaxyName = this.gameState.galaxy?.name?.trim();
    if (stateGalaxyName) {
      return stateGalaxyName;
    }

    const storedSetup = localStorage.getItem('srogame:setup');
    if (!storedSetup) {
      return null;
    }

    try {
      const parsed = JSON.parse(storedSetup) as GalaxySetup;
      const setupGalaxyName = parsed?.galaxyName?.trim();
      return setupGalaxyName ? setupGalaxyName : null;
    } catch {
      return null;
    }
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
    const fillKind = this.resolveFillKind(ownership, isVoid, isCenter);
    const valueLabel = this.buildValueLabel(planets, asteroids, isVoid, isCenter);
    const ownedPlanetsDotsLabel = this.buildOwnedPlanetsDotsLabel(ownership, isVoid, isCenter);

    return {
      x,
      y,
      isVoid,
      isCenter,
      fillKind,
      valueLabel,
      ownedPlanetsDotsLabel,
      coordsLabel: `${x}:${y}`,
      tooltip: this.buildTooltip(x, y, planets, asteroids, ownership, isVoid, isCenter)
    };
  }

  private resolveFillKind(
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean
  ): CellFillKind {
    if (isVoid) {
      return 'void';
    }
    if (isCenter) {
      return 'center';
    }
    if (ownership === null) {
      return 'noData';
    }

    const [ownedByPlayer, neutralOwned, botOwned, humanOwned] = ownership;
    const hasPlayer = ownedByPlayer > 0;
    const hasNeutral = neutralOwned > 0;
    const hasBot = botOwned > 0;
    const hasHuman = humanOwned > 0;

    if (hasPlayer && (hasHuman || hasBot)) {
      return 'playerAndEnemyAnyNeutral';
    }
    if (hasHuman && hasBot) {
      return 'humanBotAnyNeutral';
    }
    if (hasHuman) {
      return 'humanOrNeutral';
    }
    if (hasBot) {
      return 'botOrNeutral';
    }
    if (hasPlayer) {
      return 'playerOnly';
    }
    if (hasNeutral) {
      return 'neutralOnly';
    }

    return 'noData';
  }

  private buildValueLabel(
    planets: number,
    asteroids: number,
    isVoid: boolean,
    isCenter: boolean
  ): string {
    if (isVoid || isCenter) {
      return '';
    }

    const planetsLabel = planets > 0 ? `${planets}` : '';
    const asteroidDots = '.'.repeat(Math.max(0, Math.min(3, asteroids)));
    return `${planetsLabel}${asteroidDots}`;
  }

  private buildOwnedPlanetsDotsLabel(
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean
  ): string {
    if (isVoid || isCenter || ownership === null) {
      return '';
    }

    const ownedPlanets = Math.max(0, Math.min(4, ownership[0]));
    return '\u25CF'.repeat(ownedPlanets);
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

    const visiblePlanets = Math.max(0, planets);
    const header = `${x},${y} | Planets: ${visiblePlanets}, Asteroids: ${asteroids}`;
    if (!ownership) {
      return `${header} | No espionage data`;
    }

    const [ownedByPlayer, neutralOwned, botOwned, humanOwned] = ownership;
    return `${header} | You: ${ownedByPlayer}, Neutral: ${neutralOwned}, Bot: ${botOwned}, Human: ${humanOwned}`;
  }
}
