import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { GameApiService } from '../../../core/game-api.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { resolveApiErrorMessage } from '../../../i18n/api-message.utils';
import { I18nPipe } from '../../../i18n/i18n.pipe';
import { I18nService } from '../../../i18n/i18n.service';
import { ShipType } from '../../../models/enums/ship-type';
import { TechnologyType } from '../../../models/enums/technology-type';
import type {
  ClientCoordinates,
  ClientPlanetDto,
  CreateFleetMissionRequest,
} from '../../../models/game-api-types';
import { FleetMissionType } from '../../../models/enums/fleet-mission-type';
import { ManyShips } from '../../../models/fleets/many-ships';
import { FleetState } from '../../../models/fleets/fleet';
import type { Fleet } from '../../../models/fleets/fleet';
import { maxActiveFleets } from '../../../models/tech/technology-effects';

type SpyLaunchOriginVm = {
  key: string;
  kind: 'PLANET' | 'FLEET';
  originFleetId: number | null;
  originName: string;
  coordinates: ClientCoordinates;
  label: string;
  coordinatesLabel: string;
  distance: number;
  totalProbes: number;
  undamagedProbes: number;
  damagedProbes: number;
};

@Component({
  selector: 'app-spy-launch-dialog',
  imports: [FormsModule, I18nPipe],
  templateUrl: './spy-launch-dialog.component.html',
  styleUrl: './spy-launch-dialog.component.css',
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
  protected activeFleetCount = 0;
  protected maxActiveFleetCount = maxActiveFleets(0);

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly i18n: I18nService,
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
    return (
      this.eligibleOrigins.find((entry) => entry.key === this.selectedOriginCoordinates) ?? null
    );
  }

  protected selectedOriginMaxProbeAmount(): number {
    return this.selectedOrigin()?.totalProbes ?? 0;
  }

  protected canLaunch(): boolean {
    return (
      !this.isLoading &&
      !this.isLaunching &&
      !!this.targetPlanet &&
      !!this.selectedOrigin() &&
      this.probeAmount >= 1 &&
      this.probeAmount <= this.selectedOriginMaxProbeAmount()
    );
  }

  protected activeFleetCountLabel(): string {
    return `${this.activeFleetCount}/${this.maxActiveFleetCount}`;
  }

  protected setSelectedOrigin(coordinatesLabel: string): void {
    this.selectedOriginCoordinates = coordinatesLabel;
    this.probeAmount = Math.min(
      Math.max(1, this.probeAmount),
      Math.max(1, this.selectedOriginMaxProbeAmount()),
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
      this.error = this.i18n.t('generated.spyDialog.launch.noSession');
      return;
    }

    const undamagedAmount = Math.min(this.probeAmount, selectedOrigin.undamagedProbes);
    const damagedAmount = Math.max(0, this.probeAmount - undamagedAmount);
    const request: CreateFleetMissionRequest = {
      missionType: FleetMissionType.SPY,
      origin: selectedOrigin.coordinates,
      originFleetId: selectedOrigin.originFleetId,
      target: this.targetPlanet.coordinates,
      ships: [
        {
          type: ShipType.SPY_PROBE,
          undamagedAmount,
          damagedAmount,
        },
      ],
      carriedBombs: [],
      cargo: {
        metal: 0,
        crystal: 0,
        deuterium: 0,
      },
    };

    this.isLaunching = true;
    this.error = null;

    this.gameApi
      .createFleetMission(request, session.token)
      .pipe(
        finalize(() => {
          this.isLaunching = false;
          this.changeDetectorRef.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          const message = response.message?.trim().length
            ? response.message
            : this.i18n.t('generated.missionReports.spy.launchedFromOrigin', {
                origin: selectedOrigin.originName,
              });
          this.launched.emit({ message });
          this.closed.emit();
        },
        error: (error) => {
          this.error = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('generated.spyDialog.launch.launchFailed'),
          );
          this.changeDetectorRef.markForCheck();
        },
      });
  }

  private loadEligibleOrigins(): void {
    if (!this.targetPlanet) {
      this.eligibleOrigins = [];
      this.selectedOriginCoordinates = '';
      this.probeAmount = 1;
      this.error = this.i18n.t('generated.spyDialog.launch.targetUnavailable');
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.eligibleOrigins = [];
      this.selectedOriginCoordinates = '';
      this.probeAmount = 1;
      this.error = this.i18n.t('generated.spyDialog.launch.noSession');
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.eligibleOrigins = [];
    this.selectedOriginCoordinates = '';
    this.probeAmount = 1;
    this.activeFleetCount = 0;
    this.maxActiveFleetCount = maxActiveFleets(0);

    forkJoin({
      ownedPlanets: this.gameApi.getOwnedPlanets(session.token),
      activeFleets: this.gameApi.getActiveFleets(session.token),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
        }),
      )
      .subscribe({
        next: ({ ownedPlanets, activeFleets }) => {
          this.activeFleetCount = activeFleets.length;
          this.maxActiveFleetCount = maxActiveFleets(
            this.techLevel(ownedPlanets, TechnologyType.COMPUTER_TECHNOLOGY),
          );
          this.eligibleOrigins = [
            ...ownedPlanets.map((planet) =>
              this.buildPlanetOriginVm(planet, this.targetPlanet!.coordinates),
            ),
            ...activeFleets.map((fleet) =>
              this.buildFleetOriginVm(fleet, this.targetPlanet!.coordinates),
            ),
          ]
            .filter((entry): entry is SpyLaunchOriginVm => entry !== null)
            .sort(
              (left, right) =>
                left.distance - right.distance ||
                left.coordinates.y - right.coordinates.y ||
                left.coordinates.x - right.coordinates.x ||
                left.coordinates.z - right.coordinates.z ||
                left.kind.localeCompare(right.kind) ||
                left.originName.localeCompare(right.originName),
            );

          if (this.eligibleOrigins.length > 0) {
            this.selectedOriginCoordinates = this.eligibleOrigins[0].key;
            this.probeAmount = 1;
          }
        },
        error: (error) => {
          this.error = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('generated.spyDialog.launch.loadOriginsFailed'),
          );
        },
      });
  }

  private techLevel(ownedPlanets: ClientPlanetDto[], technologyType: TechnologyType): number {
    const techLevels = ownedPlanets[0]?.reportData?.techLevels ?? [];
    const matchingEntry = techLevels.find((entry) => entry.type === technologyType);
    return matchingEntry?.level ?? 0;
  }

  private buildPlanetOriginVm(
    planet: ClientPlanetDto,
    targetCoordinates: ClientCoordinates,
  ): SpyLaunchOriginVm | null {
    const undamagedProbes =
      ManyShips.undamagedCountByType(planet.objects.ships).get(ShipType.SPY_PROBE) ?? 0;
    const damagedProbes =
      ManyShips.damagedCountByType(planet.objects.ships).get(ShipType.SPY_PROBE) ?? 0;
    const totalProbes = undamagedProbes + damagedProbes;
    if (totalProbes <= 0) {
      return null;
    }

    const coordinatesLabel = this.formatCoordinates(planet.coordinates);
    const distance = this.calculateDistance(planet.coordinates, targetCoordinates);
    const probeLabel = this.probeLabel(totalProbes, damagedProbes);

    return {
      key: `planet:${coordinatesLabel}`,
      kind: 'PLANET',
      originFleetId: null,
      originName: planet.basicInfo.name,
      coordinates: planet.coordinates,
      label: this.i18n.t('generated.spyDialog.launch.planetOriginLabel', {
        planet: planet.basicInfo.name,
        coordinates: coordinatesLabel,
        probeLabel,
      }),
      coordinatesLabel,
      distance,
      totalProbes,
      undamagedProbes,
      damagedProbes,
    };
  }

  private buildFleetOriginVm(
    fleet: Fleet,
    targetCoordinates: ClientCoordinates,
  ): SpyLaunchOriginVm | null {
    if (fleet.state !== FleetState.ORBITING || fleet.pendingMaintenanceRequestId !== null) {
      return null;
    }

    const undamagedProbes =
      ManyShips.undamagedCountByType(fleet.ships).get(ShipType.SPY_PROBE) ?? 0;
    const damagedProbes = ManyShips.damagedCountByType(fleet.ships).get(ShipType.SPY_PROBE) ?? 0;
    const totalProbes = undamagedProbes + damagedProbes;
    if (totalProbes <= 0) {
      return null;
    }

    const coordinates = fleet.target;
    const coordinatesLabel = this.formatCoordinates(coordinates);
    const distance = this.calculateDistance(coordinates, targetCoordinates);
    const probeLabel = this.probeLabel(totalProbes, damagedProbes);

    return {
      key: `fleet:${fleet.fleetId}`,
      kind: 'FLEET',
      originFleetId: fleet.fleetId,
      originName: `Fleet #${fleet.fleetId}`,
      coordinates,
      label: this.i18n.t('generated.spyDialog.launch.fleetOriginLabel', {
        fleetId: fleet.fleetId,
        targetPlanet: fleet.targetPlanetName,
        coordinates: coordinatesLabel,
        probeLabel,
      }),
      coordinatesLabel,
      distance,
      totalProbes,
      undamagedProbes,
      damagedProbes,
    };
  }

  private calculateDistance(left: ClientCoordinates, right: ClientCoordinates): number {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) + Math.abs(left.z - right.z);
  }

  private formatCoordinates(coordinates: ClientCoordinates): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }

  private probeLabel(totalProbes: number, damagedProbes: number): string {
    if (damagedProbes > 0) {
      return this.i18n.t('generated.spyDialog.launch.probeLabelDamaged', {
        count: totalProbes,
        damaged: damagedProbes,
      });
    }

    return this.i18n.t(
      totalProbes === 1
        ? 'generated.spyDialog.launch.probeLabelOne'
        : 'generated.spyDialog.launch.probeLabelMany',
      { count: totalProbes },
    );
  }
}
