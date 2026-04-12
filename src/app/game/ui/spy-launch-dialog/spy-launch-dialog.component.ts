import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameApiService } from '../../../core/game-api.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { resolveApiErrorMessage } from '../../../i18n/api-message.utils';
import { I18nService } from '../../../i18n/i18n.service';
import { ShipType } from '../../../models/enums/ship-type';
import type { ClientCoordinates, ClientPlanetDto, CreateFleetMissionRequest } from '../../../models/game-api-types';
import { FleetMissionType } from '../../../models/enums/fleet-mission-type';
import { ManyShips } from '../../../models/fleets/many-ships';

type SpyLaunchOriginVm = {
  planet: ClientPlanetDto;
  label: string;
  coordinatesLabel: string;
  distance: number;
  totalProbes: number;
  undamagedProbes: number;
  damagedProbes: number;
};

@Component({
  selector: 'app-spy-launch-dialog',
  imports: [FormsModule],
  templateUrl: './spy-launch-dialog.component.html',
  styleUrl: './spy-launch-dialog.component.css'
})
export class SpyLaunchDialogComponent implements OnChanges {
  @Input() public isOpen = false;
  @Input() public targetPlanet: ClientPlanetDto | null = null;

  @Output() public readonly closed = new EventEmitter<void>();
  @Output() public readonly launched = new EventEmitter<{ message: string }>();

  protected isLoading = false;
  protected isLaunching = false;
  protected error: string | null = null;
  protected eligibleOrigins: SpyLaunchOriginVm[] = [];
  protected selectedOriginCoordinates = '';
  protected probeAmount = 1;

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly i18n: I18nService
  ) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (!this.isOpen || (!changes['isOpen'] && !changes['targetPlanet'])) {
      return;
    }

    this.loadEligibleOrigins();
  }

  @HostListener('window:keydown.escape')
  protected onEscapeKey(): void {
    if (!this.isOpen) {
      return;
    }

    this.close();
  }

  protected close(): void {
    if (this.isLaunching) {
      return;
    }

    this.closed.emit();
  }

  protected targetCoordinatesLabel(): string {
    if (!this.targetPlanet) {
      return '--:--:--';
    }

    return this.formatCoordinates(this.targetPlanet.coordinates);
  }

  protected selectedOrigin(): SpyLaunchOriginVm | null {
    return this.eligibleOrigins.find((entry) => entry.coordinatesLabel === this.selectedOriginCoordinates) ?? null;
  }

  protected selectedOriginMaxProbeAmount(): number {
    return this.selectedOrigin()?.totalProbes ?? 0;
  }

  protected canLaunch(): boolean {
    return !this.isLoading
      && !this.isLaunching
      && !!this.targetPlanet
      && !!this.selectedOrigin()
      && this.probeAmount >= 1
      && this.probeAmount <= this.selectedOriginMaxProbeAmount();
  }

  protected setSelectedOrigin(coordinatesLabel: string): void {
    this.selectedOriginCoordinates = coordinatesLabel;
    this.probeAmount = Math.min(
      Math.max(1, this.probeAmount),
      Math.max(1, this.selectedOriginMaxProbeAmount())
    );
    this.error = null;
  }

  protected launch(): void {
    const selectedOrigin = this.selectedOrigin();
    if (!this.targetPlanet || !selectedOrigin || !this.canLaunch()) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.error = 'No player session found.';
      return;
    }

    const undamagedAmount = Math.min(this.probeAmount, selectedOrigin.undamagedProbes);
    const damagedAmount = Math.max(0, this.probeAmount - undamagedAmount);
    const request: CreateFleetMissionRequest = {
      missionType: FleetMissionType.SPY,
      origin: selectedOrigin.planet.coordinates,
      target: this.targetPlanet.coordinates,
      ships: [
        {
          type: ShipType.SPY_PROBE,
          undamagedAmount,
          damagedAmount
        }
      ],
      carriedBombs: [],
      cargo: {
        metal: 0,
        crystal: 0,
        deuterium: 0
      }
    };

    this.isLaunching = true;
    this.error = null;

    this.gameApi.createFleetMission(request, session.token)
      .pipe(finalize(() => {
        this.isLaunching = false;
        this.changeDetectorRef.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          const message = response.message?.trim().length
            ? response.message
            : `Spy mission launched from ${selectedOrigin.planet.basicInfo.name}.`;
          this.launched.emit({ message });
          this.closed.emit();
        },
        error: (error) => {
          this.error = resolveApiErrorMessage(this.i18n, error, 'Unable to launch spy mission.');
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  private loadEligibleOrigins(): void {
    if (!this.targetPlanet) {
      this.eligibleOrigins = [];
      this.selectedOriginCoordinates = '';
      this.probeAmount = 1;
      this.error = 'Target planet is unavailable.';
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.eligibleOrigins = [];
      this.selectedOriginCoordinates = '';
      this.probeAmount = 1;
      this.error = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.eligibleOrigins = [];
    this.selectedOriginCoordinates = '';
    this.probeAmount = 1;

    this.gameApi.getOwnedPlanets(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      }))
      .subscribe({
        next: (ownedPlanets) => {
          this.eligibleOrigins = ownedPlanets
            .map((planet) => this.buildEligibleOriginVm(planet, this.targetPlanet!.coordinates))
            .filter((entry): entry is SpyLaunchOriginVm => entry !== null)
            .sort((left, right) =>
              left.distance - right.distance
              || left.planet.coordinates.y - right.planet.coordinates.y
              || left.planet.coordinates.x - right.planet.coordinates.x
              || left.planet.coordinates.z - right.planet.coordinates.z
              || left.planet.basicInfo.name.localeCompare(right.planet.basicInfo.name)
            );

          if (this.eligibleOrigins.length > 0) {
            this.selectedOriginCoordinates = this.eligibleOrigins[0].coordinatesLabel;
            this.probeAmount = 1;
          }
        },
        error: (error) => {
          this.error = resolveApiErrorMessage(this.i18n, error, 'Unable to load spy launch origins.');
        }
      });
  }

  private buildEligibleOriginVm(
    planet: ClientPlanetDto,
    targetCoordinates: ClientCoordinates
  ): SpyLaunchOriginVm | null {
    const undamagedProbes = ManyShips.undamagedCountByType(planet.objects.ships).get(ShipType.SPY_PROBE) ?? 0;
    const damagedProbes = ManyShips.damagedCountByType(planet.objects.ships).get(ShipType.SPY_PROBE) ?? 0;
    const totalProbes = undamagedProbes + damagedProbes;
    if (totalProbes <= 0) {
      return null;
    }

    const coordinatesLabel = this.formatCoordinates(planet.coordinates);
    const distance = this.calculateDistance(planet.coordinates, targetCoordinates);
    const probeLabel = damagedProbes > 0
      ? `${totalProbes} probe${totalProbes === 1 ? '' : 's'} (${damagedProbes} damaged)`
      : `${totalProbes} probe${totalProbes === 1 ? '' : 's'}`;

    return {
      planet,
      label: `${planet.basicInfo.name} (${coordinatesLabel}) | ${probeLabel}`,
      coordinatesLabel,
      distance,
      totalProbes,
      undamagedProbes,
      damagedProbes
    };
  }

  private calculateDistance(left: ClientCoordinates, right: ClientCoordinates): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) + Math.abs(left.z - right.z);
  }

  private formatCoordinates(coordinates: ClientCoordinates): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }
}
