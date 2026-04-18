import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { GameApiService } from '../../../core/game-api.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { resolveApiErrorMessage } from '../../../i18n/api-message.utils';
import { I18nService } from '../../../i18n/i18n.service';
import { PlanetType } from '../../../models/enums/planet-type';
import { ShipType } from '../../../models/enums/ship-type';
import { TechnologyType } from '../../../models/enums/technology-type';
import type { ClientCoordinates, ClientPlanetDto, ClientStarSystemDto, CreateStarSystemSpyRequest } from '../../../models/game-api-types';
import { ManyShips } from '../../../models/fleets/many-ships';
import { maxActiveFleets } from '../../../models/tech/technology-effects';

type SpySystemOriginVm = {
  planet: ClientPlanetDto;
  label: string;
  coordinatesLabel: string;
  totalProbes: number;
  undamagedProbes: number;
  damagedProbes: number;
  totalDistance: number;
  maxDistance: number;
};

@Component({
  selector: 'app-spy-solar-system-dialog',
  imports: [FormsModule],
  templateUrl: './spy-solar-system-dialog.component.html',
  styleUrl: './spy-solar-system-dialog.component.css'
})
export class SpySolarSystemDialogComponent implements OnChanges {
  @Input() public isOpen = false;
  @Input() public starSystem: ClientStarSystemDto | null = null;

  @Output() public readonly closed = new EventEmitter<void>();
  @Output() public readonly launched = new EventEmitter<{ message: string }>();

  protected isLoading = false;
  protected isLaunching = false;
  protected error: string | null = null;
  protected eligibleOrigins: SpySystemOriginVm[] = [];
  protected selectedOriginCoordinates = '';
  protected targetPlanets: ClientPlanetDto[] = [];
  protected activeFleetCount = 0;
  protected maxActiveFleetCount = maxActiveFleets(0);

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly i18n: I18nService
  ) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (!this.isOpen || (!changes['isOpen'] && !changes['starSystem'])) {
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

  protected systemCoordinatesLabel(): string {
    if (!this.starSystem) {
      return '--:--';
    }

    return `${this.starSystem.coordinates.x}:${this.starSystem.coordinates.y}`;
  }

  protected selectedOrigin(): SpySystemOriginVm | null {
    return this.eligibleOrigins.find((entry) => entry.coordinatesLabel === this.selectedOriginCoordinates) ?? null;
  }

  protected requiredProbeCount(): number {
    return this.targetPlanets.length;
  }

  protected requiredFleetSlots(): number {
    return this.targetPlanets.length;
  }

  protected activeFleetCountLabel(): string {
    return `${this.activeFleetCount}/${this.maxActiveFleetCount}`;
  }

  protected targetListLabel(): string {
    return this.targetPlanets
      .map((planet) => `${planet.basicInfo.name} (${this.formatCoordinates(planet.coordinates)})`)
      .join(', ');
  }

  protected fleetSlotsRemaining(): number {
    return Math.max(0, this.maxActiveFleetCount - this.activeFleetCount);
  }

  protected fleetSlotBlockerMessage(): string | null {
    if ((this.activeFleetCount + this.requiredFleetSlots()) <= this.maxActiveFleetCount) {
      return null;
    }

    return `Spy solar system needs ${this.requiredFleetSlots()} free fleet slots, but only ${this.fleetSlotsRemaining()} are available.`;
  }

  protected originAvailabilityMessage(): string {
    if (this.targetPlanets.length <= 0) {
      return 'No non-owned, non-asteroid planets are available in this star system.';
    }

    return `No owned planets with at least ${this.requiredProbeCount()} espionage probes are available.`;
  }

  protected canLaunch(): boolean {
    return !this.isLoading
      && !this.isLaunching
      && !!this.starSystem
      && this.targetPlanets.length > 0
      && !!this.selectedOrigin()
      && this.fleetSlotBlockerMessage() === null;
  }

  protected setSelectedOrigin(coordinatesLabel: string): void {
    this.selectedOriginCoordinates = coordinatesLabel;
    this.error = null;
  }

  protected launch(): void {
    const selectedOrigin = this.selectedOrigin();
    if (!this.starSystem || !selectedOrigin || !this.canLaunch()) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.error = 'No player session found.';
      return;
    }

    const request: CreateStarSystemSpyRequest = {
      systemCoordinates: {
        x: this.starSystem.coordinates.x,
        y: this.starSystem.coordinates.y
      },
      origin: selectedOrigin.planet.coordinates
    };

    this.isLaunching = true;
    this.error = null;

    this.gameApi.createStarSystemSpyMission(request, session.token)
      .pipe(finalize(() => {
        this.isLaunching = false;
        this.changeDetectorRef.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          const message = response.message?.trim().length
            ? response.message
            : `Star system espionage launched across ${this.systemCoordinatesLabel()}.`;
          this.launched.emit({ message });
          this.closed.emit();
        },
        error: (error) => {
          this.error = resolveApiErrorMessage(this.i18n, error, 'Unable to launch star system espionage.');
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  private loadEligibleOrigins(): void {
    if (!this.starSystem) {
      this.targetPlanets = [];
      this.eligibleOrigins = [];
      this.selectedOriginCoordinates = '';
      this.activeFleetCount = 0;
      this.maxActiveFleetCount = maxActiveFleets(0);
      this.error = 'Star system is unavailable.';
      return;
    }

    this.targetPlanets = this.starSystem.planets.filter((planet) =>
      planet.basicInfo.type !== PlanetType.ASTEROIDS && !planet.info.isOwnedByViewer
    );
    this.eligibleOrigins = [];
    this.selectedOriginCoordinates = '';
    this.activeFleetCount = 0;
    this.maxActiveFleetCount = maxActiveFleets(0);
    if (this.targetPlanets.length <= 0) {
      this.error = null;
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.error = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.error = null;

    forkJoin({
      ownedPlanets: this.gameApi.getOwnedPlanets(session.token),
      activeFleets: this.gameApi.getActiveFleets(session.token)
    })
      .pipe(finalize(() => {
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      }))
      .subscribe({
        next: ({ ownedPlanets, activeFleets }) => {
          this.activeFleetCount = activeFleets.length;
          this.maxActiveFleetCount = maxActiveFleets(this.techLevel(ownedPlanets, TechnologyType.COMPUTER_TECHNOLOGY));
          this.eligibleOrigins = ownedPlanets
            .map((planet) => this.buildEligibleOriginVm(planet, this.targetPlanets))
            .filter((entry): entry is SpySystemOriginVm => entry !== null)
            .filter((entry) => entry.totalProbes >= this.requiredProbeCount())
            .sort((left, right) =>
              left.totalDistance - right.totalDistance
              || left.maxDistance - right.maxDistance
              || left.planet.coordinates.y - right.planet.coordinates.y
              || left.planet.coordinates.x - right.planet.coordinates.x
              || left.planet.coordinates.z - right.planet.coordinates.z
              || left.planet.basicInfo.name.localeCompare(right.planet.basicInfo.name)
            );

          if (this.eligibleOrigins.length > 0) {
            this.selectedOriginCoordinates = this.eligibleOrigins[0].coordinatesLabel;
          }
        },
        error: (error) => {
          this.error = resolveApiErrorMessage(this.i18n, error, 'Unable to load star system spy origins.');
        }
      });
  }

  private techLevel(ownedPlanets: ClientPlanetDto[], technologyType: TechnologyType): number {
    const techLevels = ownedPlanets[0]?.reportData?.techLevels ?? [];
    const matchingEntry = techLevels.find((entry) => entry.type === technologyType);
    return matchingEntry?.level ?? 0;
  }

  private buildEligibleOriginVm(
    planet: ClientPlanetDto,
    targetPlanets: ClientPlanetDto[]
  ): SpySystemOriginVm | null {
    const undamagedProbes = ManyShips.undamagedCountByType(planet.objects.ships).get(ShipType.SPY_PROBE) ?? 0;
    const damagedProbes = ManyShips.damagedCountByType(planet.objects.ships).get(ShipType.SPY_PROBE) ?? 0;
    const totalProbes = undamagedProbes + damagedProbes;
    if (totalProbes <= 0) {
      return null;
    }

    let totalDistance = 0;
    let maxDistance = 0;
    for (const targetPlanet of targetPlanets) {
      const distance = this.calculateDistance(planet.coordinates, targetPlanet.coordinates);
      totalDistance += distance;
      maxDistance = Math.max(maxDistance, distance);
    }

    const coordinatesLabel = this.formatCoordinates(planet.coordinates);
    const probeLabel = damagedProbes > 0
      ? `${totalProbes} probe${totalProbes === 1 ? '' : 's'} (${damagedProbes} damaged)`
      : `${totalProbes} probe${totalProbes === 1 ? '' : 's'}`;

    return {
      planet,
      label: `${planet.basicInfo.name} (${coordinatesLabel}) | ${probeLabel}`,
      coordinatesLabel,
      totalProbes,
      undamagedProbes,
      damagedProbes,
      totalDistance,
      maxDistance
    };
  }

  private calculateDistance(left: ClientCoordinates, right: ClientCoordinates): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) + Math.abs(left.z - right.z);
  }

  private formatCoordinates(coordinates: ClientCoordinates): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }
}
