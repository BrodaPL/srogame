import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { DefenceBlueprintsFactory } from '../../factories/defence-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { TechnologyBlueprintsFactory } from '../../factories/technology-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { DefenceType } from '../../models/enums/defence-type';
import { HullClass } from '../../models/enums/hull-class';
import { ShipPurpose } from '../../models/enums/ship-purpose';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import type {
  CancelBuildingQueueEntryRequest,
  CancelShipyardQueueEntryRequest,
  BuildingQueueEntryDto,
  ClientCoordinates,
  ClientPlanetDto,
  ReorderBuildingQueueRequest,
  ReorderShipyardQueueRequest,
  SetBuildingPowerConsumptionRequest,
  ShipyardQueueEntryDto,
  StartBuildingConstructionRequest,
  StartShipyardConstructionRequest,
  TechnologyQueueEntryDto,
  TradePortOfferDto,
  UseTradePortOfferRequest
} from '../../models/game-api-types';
import { energyDeficitEfficiencyMultiplier, energyDeficitPenaltyPercent } from '../../models/planets/energy-deficit';
import { PlanetImageHelper } from '../../models/planets/planet-image-helper';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { industryPowerMultiplier, researchPowerMultiplier } from '../../models/tech/technology-effects';
import { Fleet, FleetState } from '../../models/fleets/fleet';
import { ManyShips } from '../../models/fleets/many-ships';
import { ManyDefences } from '../../models/defences/many-defences';
import { countPlanetaryBombs, isPlanetaryBombDefenceType } from '../../models/defences/planetary-bomb';
import { Defence } from '../../models/defences/defence';
import { calculateRepairCapabilityForManyShips } from '../../models/repairs/ship-repair-capability';
import { Ship } from '../../models/fleets/ship';
import { Weapon } from '../../models/fleets/weapon';
import { Technology } from '../../models/tech/technology';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import {
  PlanetPowersDisplay,
  ResourceDisplay,
  ResourceHeaderIndicator,
  ResourcesComponent
} from '../ui/resources/resources.component';
import { TutorialService } from '../../tutorial/tutorial.service';
import { tradeResourceLabel } from '../../models/trade/trade-resource-type';
import type { TradeResourceType } from '../../models/trade/trade-resource-type';
import { toRawImagePath } from '../../encyclopedia-menu/encyclopedia-image-paths';
import { PlanetObjectDialogComponent } from './planet-object-dialog.component';
import type {
  PlanetObjectDetailDialogData,
  PlanetObjectDetailRow,
  PlanetObjectDetailSection
} from './planet-object-dialog.component';

type PlanetTab = 'resources' | 'facilities' | 'ships' | 'defences' | 'operations' | 'queues';

type EnergyState = {
  used: number;
  available: number;
};

type BuildingCostRowVm = {
  label: string;
  amount: number;
  isEnough: boolean;
};

type BuildingRequirementRowVm = {
  label: string;
  isMet: boolean;
  isPlaceholder: boolean;
};

type ShipCostRowVm = {
  label: string;
  amount: number | null;
  isEnough: boolean;
  isPlaceholder: boolean;
};

type BuildingQueueRowVm = {
  queueIndex: number;
  position: number;
  buildingType: BuildingType;
  fromLevel: number;
  toLevel: number;
  investedIndustryPower: number;
  baseTotalConstructionTime: number;
  estimatedTurnsForCompletion: number | null;
  isHeadOfQueue: boolean;
};

type ShipyardQueueRowVm = {
  queueIndex: number;
  position: number;
  itemKind: 'ship' | 'defence';
  shipType: ShipType | null;
  defenceType: DefenceType | null;
  amountCompleted: number;
  amountTotal: number;
  currentUnitInvestedShipyardPower: number;
  currentUnitBaseConstructionTime: number;
  estimatedTurnsForCompletion: number | null;
  isHeadOfQueue: boolean;
};

type ResearchQueueRowVm = {
  position: number;
  role: 'Main lab' | 'Helper lab';
  technologyType: TechnologyType;
  levelLabel: string;
  helperLabsLabel: string;
  targetLabel: string;
  status: 'Researching' | 'Helping';
  investedLabel: string;
  etaLabel: string;
};

@Component({
  selector: 'app-planet-view',
  imports: [
    TopMenuComponent,
    ResourcesComponent,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    PlanetObjectDialogComponent
  ],
  templateUrl: './planet-view.component.html',
  styleUrl: './planet-view.component.css'
})
export class PlanetViewComponent implements OnInit, OnDestroy {
  protected readonly HullClass = HullClass;
  protected readonly BuildingType = BuildingType;
  protected readonly shipPurpose = ShipPurpose;
  protected planet: ClientPlanetDto | null = null;
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected isLoading = false;
  protected loadError: string | null = null;
  protected isAttentionHighlightActive = false;
  protected activeTab: PlanetTab = 'resources';
  protected activeFleets: Fleet[] = [];
  protected coordinatesLabel = '--:--:--';

  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected energyTooltip: string | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;
  protected buildingQueueActionError: string | null = null;
  protected shipyardQueueActionError: string | null = null;
  protected isTradePortDialogOpen = false;
  protected tradePortActionError: string | null = null;
  protected tradePortActionOfferId: number | null = null;
  protected buildingQueueMutationInFlight = false;
  protected shipyardQueueMutationInFlight = false;
  protected selectedObjectDetails: PlanetObjectDetailDialogData | null = null;
  protected readonly shipPurposeFilters = new Map<ShipPurpose, boolean>([
    [ShipPurpose.MILITARY, true],
    [ShipPurpose.BOMBER, true],
    [ShipPurpose.CARGO, true],
    [ShipPurpose.UTILITY, true],
    [ShipPurpose.CARRIER, true],
    [ShipPurpose.RECYCLING, true]
  ]);
  protected showRegularDefences = true;
  protected showPlanetaryBombDefences = true;

  protected readonly resourceBuildings: Building[];
  protected readonly facilityBuildings: Building[];
  protected readonly shipBlueprints: Ship[];
  protected readonly defenceBlueprints: Defence[];

  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly defenceBlueprintsByType: Map<DefenceType, Defence>;
  private readonly shipBlueprintsByType: Map<ShipType, Ship>;
  private readonly technologiesByType: Map<TechnologyType, Technology>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly buildingCurrentPowerByType = new Map<BuildingType, number>();
  private readonly buildingCurrentStructuralPointsByType = new Map<BuildingType, number>();
  private readonly powerUpdateInFlightByType = new Set<BuildingType>();
  private readonly powerUpdateErrorByType = new Map<BuildingType, string>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly buildingQueueTypes = new Set<BuildingType>();
  private readonly buildingStartInFlightByType = new Set<BuildingType>();
  private readonly buildingStartErrorByType = new Map<BuildingType, string>();
  private readonly shipStartInFlightByType = new Set<ShipType>();
  private readonly shipStartErrorByType = new Map<ShipType, string>();
  private readonly shipAmountInputs = new Map<ShipType, string>();
  private readonly defenceStartInFlightByType = new Set<DefenceType>();
  private readonly defenceStartErrorByType = new Map<DefenceType, string>();
  private readonly defenceAmountInputs = new Map<DefenceType, string>();
  private currentPlanetRequestKey = 0;
  private pendingPlanetRequests = 0;
  private loadingSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTabRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private queueTabRefreshInFlight = false;
  private attentionHighlightTimer: ReturnType<typeof setTimeout> | null = null;
  private unregisterTutorialStepPreparer: (() => void) | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {
    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    const allBuildings = Array.from(buildingBlueprints.buildingsMap.values());
    this.resourceBuildings = allBuildings.filter((building) => !building.isFacility);
    this.facilityBuildings = allBuildings.filter((building) => building.isFacility);
    this.buildingBlueprintsByType = new Map(buildingBlueprints.buildingsMap);

    const defences = DefenceBlueprintsFactory.fromDefaultJson();
    this.defenceBlueprints = Array.from(defences.defencesMap.values());
    this.defenceBlueprintsByType = new Map(defences.defencesMap);

    const ships = ShipBlueprintsFactory.fromDefaultJson();
    this.shipBlueprints = Array.from(ships.shipsMap.values());
    this.shipBlueprintsByType = new Map(ships.shipsMap);

    const technologies = TechnologyBlueprintsFactory.fromDefaultJson();
    this.technologiesByType = new Map(technologies.techByType);
    this.unregisterTutorialStepPreparer = this.tutorialService.registerStepPreparer(
      'planetView',
      (step) => this.prepareTutorialStep(step.targetId)
    );
  }

  public ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const x = this.parseNonNegativeInt(params.get('x'));
      const y = this.parseNonNegativeInt(params.get('y'));
      const z = this.parseNonNegativeInt(params.get('z'));
      this.updateAttentionHighlight(params.get('highlight') === 'attention');

      if (x === null || y === null || z === null) {
        this.stopQueueTabAutoRefresh();
        this.isLoading = false;
        this.loadError = 'Invalid planet coordinates in route.';
        this.planet = null;
        this.cdr.markForCheck();
        return;
      }

      this.coordinatesLabel = `${x}:${y}:${z}`;
      this.loadPlanet(x, y, z);
      this.cdr.markForCheck();
    });
  }

  public ngOnDestroy(): void {
    this.stopQueueTabAutoRefresh();
    this.clearLoadingSafetyTimeout();
    this.clearAttentionHighlightTimeout();
    this.unregisterTutorialStepPreparer?.();
    this.unregisterTutorialStepPreparer = null;
  }

  protected setTab(tab: PlanetTab): void {
    if (this.activeTab === tab) {
      if (tab === 'queues') {
        this.startQueueTabAutoRefresh();
      }

      return;
    }

    this.activeTab = tab;
    if (tab === 'queues') {
      this.startQueueTabAutoRefresh();
      return;
    }

    this.stopQueueTabAutoRefresh();
  }

  protected isActiveTab(tab: PlanetTab): boolean {
    return this.activeTab === tab;
  }

  protected buildingLevel(buildingType: BuildingType): number {
    return this.buildingLevelsByType.get(buildingType) ?? 0;
  }

  protected buildingProductionAtCurrentLevel(building: Building): number {
    const level = this.buildingLevel(building.type);
    return this.getProductionAtLevel(building, level);
  }

  protected buildingCurrentPowerConsumption(building: Building): number {
    const maxConsumption = this.maxBuildingPowerConsumption(building.type);
    const current = this.buildingCurrentPowerByType.get(building.type);
    if (current === undefined) {
      return maxConsumption;
    }

    return this.roundNumber(Math.min(maxConsumption, Math.max(0, current)), 2);
  }

  protected buildingMaxPowerConsumption(building: Building): number {
    return this.maxBuildingPowerConsumption(building.type);
  }

  protected buildingCurrentStructuralPoints(building: Building): number {
    return this.currentBuildingStructuralPoints(building.type);
  }

  protected buildingMaxStructuralPoints(building: Building): number {
    return this.maxBuildingStructuralPoints(building.type, this.buildingLevel(building.type));
  }

  protected buildingStructuralUtilizationPercent(building: Building): number {
    return Math.round(this.structuralUtilizationAtLevel(building.type, this.buildingLevel(building.type)) * 100);
  }

  protected buildingMinimumStructuralUtilizationPercent(building: Building): number {
    return Math.round(this.minimumStructuralUtilization(building.type) * 100);
  }

  protected shouldShowPowerManagement(building: Building): boolean {
    const level = this.buildingLevel(building.type);
    const powerPerLevel = building.powerConsumption ?? 0;
    return level > 0 && powerPerLevel > 0;
  }

  protected isPowerManagementDisabled(building: Building): boolean {
    const level = this.buildingLevel(building.type);
    const powerPerLevel = building.powerConsumption ?? 0;
    return (
      level <= 0
      || powerPerLevel <= 0
      || this.powerUpdateInFlightByType.has(building.type)
    );
  }

  protected powerManagementError(building: Building): string | null {
    return this.powerUpdateErrorByType.get(building.type) ?? null;
  }

  protected buildingPowerOptions(building: Building): number[] {
    const level = this.buildingLevel(building.type);
    const powerPerLevel = building.powerConsumption ?? 0;
    if (level <= 0 || powerPerLevel <= 0) {
      return [0];
    }

    const options: number[] = [];
    for (let index = 0; index <= level; index += 1) {
      options.push(this.roundNumber(index * powerPerLevel, 2));
    }

    return options;
  }

  protected onBuildingPowerConsumptionChange(building: Building, rawValue: unknown): void {
    if (this.isPowerManagementDisabled(building)) {
      return;
    }

    const requested = Number(rawValue);
    if (!Number.isFinite(requested)) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    if (!planet || !session) {
      return;
    }

    const allowedOptions = this.buildingPowerOptions(building);
    const normalized = allowedOptions.includes(requested)
      ? requested
      : this.maxBuildingPowerConsumption(building.type);
    const previousValue = this.buildingCurrentPowerConsumption(building);
    this.setBuildingCurrentPowerConsumption(building.type, normalized);
    this.updateResourceDisplays();
    this.powerUpdateInFlightByType.add(building.type);
    this.powerUpdateErrorByType.delete(building.type);
    this.cdr.markForCheck();

    const request: SetBuildingPowerConsumptionRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      buildingType: building.type,
      currentPowerConsumption: normalized
    };

    this.gameApi.setBuildingPowerConsumption(request, session.token)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.powerUpdateInFlightByType.delete(building.type);
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.setBuildingCurrentPowerConsumption(building.type, response.currentPowerConsumption);
          this.updateResourceDisplays();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.setBuildingCurrentPowerConsumption(building.type, previousValue);
          this.updateResourceDisplays();
          this.powerUpdateErrorByType.set(
            building.type,
            error?.error?.error ?? 'Unable to update power consumption.'
          );
          this.cdr.markForCheck();
        }
      });
  }

  protected formatPlanetaryParameterPercent(value: number): string {
    const normalized = Number.isFinite(value) ? value : 0;
    return `${Math.round(normalized * 100)}%`;
  }

  protected copyCoordinates(): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(this.coordinatesLabel);
  }

  protected planetHeroImagePath(): string | null {
    if (!this.planet) {
      return null;
    }

    return PlanetImageHelper.getPlanetImage(
      this.planet.basicInfo.type,
      this.planet.basicInfo.size,
      'normal'
    );
  }

  protected buildingBuildLabel(building: Building): string {
    if (this.isBuildingUnderConstruction(building.type)) {
      return 'Under construction';
    }

    if (this.isBuildingQueued(building.type)) {
      return 'Queued';
    }

    return 'Build';
  }

  protected buildingBuildTitle(building: Building): string {
    if (this.isBuildingQueueFull()) {
      return 'Queue full.';
    }

    if (this.buildingStartInFlightByType.has(building.type)) {
      return 'Adding to queue...';
    }

    if (this.isBuildingUnderConstruction(building.type)) {
      return 'Under construction.';
    }

    if (this.isBuildingQueued(building.type)) {
      return 'Queued.';
    }

    if (!this.canBuildBuilding(building)) {
      return 'Requirements not met or insufficient resources.';
    }

    return 'Add building to queue.';
  }

  protected canBuildBuilding(building: Building): boolean {
    if (!this.planet || this.planet.info.ownerId === null) {
      return false;
    }

    if (this.buildingStartInFlightByType.has(building.type)) {
      return false;
    }

    if (this.isBuildingQueueFull()) {
      return false;
    }

    if (this.isBuildingQueued(building.type)) {
      return false;
    }

    const levelWeAreUpgradingTo = this.buildingLevel(building.type) + 1;
    const cost = building.getCostForLevel(levelWeAreUpgradingTo);
    if (!this.hasEnoughResources(cost)) {
      return false;
    }

    if (!this.hasBuildingRequirements(building.buildingRequirements, levelWeAreUpgradingTo)) {
      return false;
    }

    if (!this.hasTechRequirements(building.techRequirements, levelWeAreUpgradingTo)) {
      return false;
    }

    return true;
  }

  protected onBuildBuilding(building: Building): void {
    if (!this.canBuildBuilding(building)) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    if (!planet || !session) {
      return;
    }

    this.buildingStartInFlightByType.add(building.type);
    this.buildingStartErrorByType.delete(building.type);
    this.cdr.markForCheck();

    const request: StartBuildingConstructionRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      buildingType: building.type
    };

    this.gameApi.startBuildingConstruction(request, session.token)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.buildingStartInFlightByType.delete(building.type);
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedPlanet) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.buildingStartErrorByType.set(
            building.type,
            error?.error?.error ?? 'Unable to add building to queue.'
          );
          this.cdr.markForCheck();
        }
      });
  }

  protected buildingStartError(building: Building): string | null {
    return this.buildingStartErrorByType.get(building.type) ?? null;
  }

  protected openBuildingDetails(building: Building): void {
    this.selectedObjectDetails = this.createBuildingDetailDialogData(building);
  }

  protected openShipDetails(ship: Ship): void {
    this.selectedObjectDetails = this.createShipDetailDialogData(ship);
  }

  protected openDefenceDetails(defence: Defence): void {
    this.selectedObjectDetails = this.createDefenceDetailDialogData(defence);
  }

  protected closeObjectDetails(): void {
    this.selectedObjectDetails = null;
  }

  protected shipPurposeFilterEntries(): Array<{ purpose: ShipPurpose; checked: boolean }> {
    return Array.from(this.shipPurposeFilters.entries()).map(([purpose, checked]) => ({ purpose, checked }));
  }

  protected toggleShipPurposeFilter(purpose: ShipPurpose, enabled: boolean): void {
    this.shipPurposeFilters.set(purpose, enabled);
  }

  protected filteredShipBlueprints(): Ship[] {
    return this.shipBlueprints.filter((ship) => {
      const hasAmountSelected = (this.shipAmount(ship.type) ?? 0) > 0;
      return hasAmountSelected || this.matchesShipPurposeFilter(ship);
    });
  }

  protected filteredDefenceBlueprints(): Defence[] {
    return this.defenceBlueprints.filter((defence) => {
      const hasAmountSelected = (this.defenceAmount(defence.type) ?? 0) > 0;
      return hasAmountSelected || this.matchesDefenceFilter(defence);
    });
  }

  protected shipAmountInput(shipType: ShipType): string {
    return this.shipAmountInputs.get(shipType) ?? '';
  }

  protected shipPurposeTags(ship: Ship): ShipPurpose[] {
    return Array.from(ship.purposes.values());
  }

  protected currentShipAmount(shipType: ShipType): number {
    return ManyShips.countByType(this.planet?.objects.ships).get(shipType) ?? 0;
  }

  protected currentDefenceAmount(defenceType: DefenceType): number {
    return ManyDefences.countByType(this.planet?.objects.defences).get(defenceType) ?? 0;
  }

  protected defenceAmountInput(defenceType: DefenceType): string {
    return this.defenceAmountInputs.get(defenceType) ?? '';
  }

  protected hasShipsOnPlanet(): boolean {
    return ManyShips.totalShipsCount(this.planet?.objects.ships) > 0;
  }

  protected planetTotalShipsCount(): number {
    return ManyShips.totalShipsCount(this.planet?.objects.ships);
  }

  protected planetUndamagedShipsPercent(): number {
    return ManyShips.undamagedPercentage(this.planet?.objects.ships);
  }

  protected planetDamagedShipsPercent(): number {
    return ManyShips.damagedPercentage(this.planet?.objects.ships);
  }

  protected planetUndamagedShipsTooltip(): string {
    const entries = ManyShips.groupedUndamagedEntries(this.planet?.objects.ships);
    if (entries.length <= 0) {
      return 'No undamaged ships.';
    }

    return entries
      .map((entry) => `${entry.type}: ${entry.amount}`)
      .join('\n');
  }

  protected planetDamagedShipsTooltip(): string {
    const entries = ManyShips.groupedDamagedEntries(this.planet?.objects.ships);
    if (entries.length <= 0) {
      return 'No damaged ships.';
    }

    return entries
      .map((entry) =>
        `${entry.type}: ${entry.amount}, missing HP ${entry.totalMissingHull} (${entry.averageDamagePercent}% avg)`
      )
      .join('\n');
  }

  protected planetShipDamageTone(): 'green' | 'yellow' | 'orange' | 'red' {
    const undamagedPercent = this.planetUndamagedShipsPercent();
    if (undamagedPercent >= 100) {
      return 'green';
    }

    if (undamagedPercent >= 80) {
      return 'yellow';
    }

    if (undamagedPercent >= 50) {
      return 'orange';
    }

    return 'red';
  }

  protected hasDefencesOnPlanet(): boolean {
    return ManyDefences.totalDefencesCount(this.planet?.objects.defences) > 0;
  }

  protected planetTotalDefencesCount(): number {
    return ManyDefences.totalDefencesCount(this.planet?.objects.defences);
  }

  protected bombDepotCapacity(): number {
    return Math.max(0, Math.floor(this.getProductionAtLevelByType(BuildingType.BOMB_DEPOT, this.buildingLevel(BuildingType.BOMB_DEPOT))));
  }

  protected currentPlanetaryBombCount(): number {
    return countPlanetaryBombs(this.planet?.objects.defences);
  }

  protected queuedPlanetaryBombCount(): number {
    return (this.planet?.objects.shipyardQueue ?? [])
      .filter((entry) => this.queueEntryItemKind(entry) === 'defence')
      .filter((entry) => isPlanetaryBombDefenceType(this.queueEntryDefenceType(entry)))
      .reduce((sum, entry) => sum + this.queueEntryShipAmount(entry), 0);
  }

  protected bombDepotStorageSummary(): string | null {
    const capacity = this.bombDepotCapacity();
    const current = this.currentPlanetaryBombCount();
    const queued = this.queuedPlanetaryBombCount();
    if (capacity <= 0 && current <= 0 && queued <= 0) {
      return null;
    }

    return `Bomb depot storage: ${current}/${capacity}${queued > 0 ? ` (+${queued} queued)` : ''}`;
  }

  protected planetUndamagedDefencesPercent(): number {
    const total = this.planetTotalDefencesCount();
    if (total <= 0) {
      return 100;
    }

    const undamaged = [...ManyDefences.undamagedCountByType(this.planet?.objects.defences).values()]
      .reduce((sum, amount) => sum + amount, 0);
    return Math.round((undamaged / total) * 100);
  }

  protected planetDamagedDefencesPercent(): number {
    const total = this.planetTotalDefencesCount();
    if (total <= 0) {
      return 0;
    }

    const damaged = [...ManyDefences.damagedCountByType(this.planet?.objects.defences).values()]
      .reduce((sum, amount) => sum + amount, 0);
    return Math.round((damaged / total) * 100);
  }

  protected planetUndamagedDefencesTooltip(): string {
    const entries = ManyDefences.groupedUndamagedEntries(this.planet?.objects.defences);
    if (entries.length <= 0) {
      return 'No undamaged defences.';
    }

    return entries
      .map((entry) => `${entry.type}: ${entry.amount}`)
      .join('\n');
  }

  protected planetDamagedDefencesTooltip(): string {
    const entries = ManyDefences.groupedDamagedEntries(this.planet?.objects.defences);
    if (entries.length <= 0) {
      return 'No damaged defences.';
    }

    return entries
      .map((entry) =>
        `${entry.type}: ${entry.amount}, missing HP ${entry.totalMissingHull} (${entry.averageDamagePercent}% avg)`
      )
      .join('\n');
  }

  protected planetDefenceDamageTone(): 'green' | 'yellow' | 'orange' | 'red' {
    const undamagedPercent = this.planetUndamagedDefencesPercent();
    if (undamagedPercent >= 100) {
      return 'green';
    }

    if (undamagedPercent >= 80) {
      return 'yellow';
    }

    if (undamagedPercent >= 50) {
      return 'orange';
    }

    return 'red';
  }

  protected onShipAmountInput(shipType: ShipType, rawValue: unknown): void {
    const normalized = typeof rawValue === 'number'
      ? String(rawValue)
      : typeof rawValue === 'string'
        ? rawValue
        : '';
    this.shipAmountInputs.set(shipType, normalized);
  }

  protected onDefenceAmountInput(defenceType: DefenceType, rawValue: unknown): void {
    const normalized = typeof rawValue === 'number'
      ? String(rawValue)
      : typeof rawValue === 'string'
        ? rawValue
        : '';
    this.defenceAmountInputs.set(defenceType, normalized);
  }

  protected shipSingleCostRows(ship: Ship): BuildingCostRowVm[] {
    const currentResources = this.planet?.objects.resources;
    return [
      {
        label: 'Metal',
        amount: ship.cost.metal,
        isEnough: (currentResources?.metal ?? 0) >= ship.cost.metal
      },
      {
        label: 'Crystal',
        amount: ship.cost.crystal,
        isEnough: (currentResources?.crystal ?? 0) >= ship.cost.crystal
      },
      {
        label: 'Deuterium',
        amount: ship.cost.deuterium,
        isEnough: (currentResources?.deuterium ?? 0) >= ship.cost.deuterium
      }
    ];
  }

  protected shipTotalCostRows(ship: Ship): ShipCostRowVm[] {
    const amount = this.shipAmount(ship.type);
    if (amount === null) {
      return [
        { label: 'Metal', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'Crystal', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'Deuterium', amount: null, isEnough: true, isPlaceholder: true }
      ];
    }

    const total = this.multiplyCost(ship.cost, amount);
    const currentResources = this.planet?.objects.resources;
    return [
      {
        label: 'Metal',
        amount: total.metal,
        isEnough: (currentResources?.metal ?? 0) >= total.metal,
        isPlaceholder: false
      },
      {
        label: 'Crystal',
        amount: total.crystal,
        isEnough: (currentResources?.crystal ?? 0) >= total.crystal,
        isPlaceholder: false
      },
      {
        label: 'Deuterium',
        amount: total.deuterium,
        isEnough: (currentResources?.deuterium ?? 0) >= total.deuterium,
        isPlaceholder: false
      }
    ];
  }

  protected defenceSingleCostRows(defence: Defence): BuildingCostRowVm[] {
    const currentResources = this.planet?.objects.resources;
    return [
      {
        label: 'Metal',
        amount: defence.cost.metal,
        isEnough: (currentResources?.metal ?? 0) >= defence.cost.metal
      },
      {
        label: 'Crystal',
        amount: defence.cost.crystal,
        isEnough: (currentResources?.crystal ?? 0) >= defence.cost.crystal
      },
      {
        label: 'Deuterium',
        amount: defence.cost.deuterium,
        isEnough: (currentResources?.deuterium ?? 0) >= defence.cost.deuterium
      }
    ];
  }

  protected defenceTotalCostRows(defence: Defence): ShipCostRowVm[] {
    const amount = this.defenceAmount(defence.type);
    if (amount === null) {
      return [
        { label: 'Metal', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'Crystal', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'Deuterium', amount: null, isEnough: true, isPlaceholder: true }
      ];
    }

    const total = this.multiplyCost(defence.cost, amount);
    const currentResources = this.planet?.objects.resources;
    return [
      { label: 'Metal', amount: total.metal, isEnough: (currentResources?.metal ?? 0) >= total.metal, isPlaceholder: false },
      { label: 'Crystal', amount: total.crystal, isEnough: (currentResources?.crystal ?? 0) >= total.crystal, isPlaceholder: false },
      { label: 'Deuterium', amount: total.deuterium, isEnough: (currentResources?.deuterium ?? 0) >= total.deuterium, isPlaceholder: false }
    ];
  }

  protected shipRequirementRows(ship: Ship): BuildingRequirementRowVm[] {
    const rows: BuildingRequirementRowVm[] = [];

    for (const requirement of ship.buildingRequirements) {
        const requiredLevel = Math.ceil(requirement.level);
        const currentLevel = this.buildingLevel(requirement.building);
        rows.push({
          label: `${requirement.building}: ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel,
          isPlaceholder: false
        });
    }

    for (const requirement of ship.techRequirements) {
        const requiredLevel = Math.ceil(requirement.level);
        const currentLevel = this.techLevel(requirement.tech);
        rows.push({
          label: `${requirement.tech} (Tech): ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel,
          isPlaceholder: false
        });
    }

    if (rows.length === 0) {
      return [
        {
          label: 'None',
          isMet: true,
          isPlaceholder: true
        }
      ];
    }

    return rows;
  }

  protected defenceRequirementRows(defence: Defence): BuildingRequirementRowVm[] {
    const rows: BuildingRequirementRowVm[] = [];

    for (const requirement of defence.buildingRequirements) {
        const requiredLevel = Math.ceil(requirement.level);
        const currentLevel = this.buildingLevel(requirement.building);
        rows.push({
          label: `${requirement.building}: ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel,
          isPlaceholder: false
        });
    }

    for (const requirement of defence.techRequirements) {
        const requiredLevel = Math.ceil(requirement.level);
        const currentLevel = this.techLevel(requirement.tech);
        rows.push({
          label: `${requirement.tech} (Tech): ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel,
          isPlaceholder: false
        });
    }

    if (rows.length === 0) {
      return [{ label: 'None', isMet: true, isPlaceholder: true }];
    }

    return rows;
  }

  protected shipHasUnmetRequirements(ship: Ship): boolean {
    return this.shipRequirementRows(ship).some((row) => !row.isMet);
  }

  protected defenceHasUnmetRequirements(defence: Defence): boolean {
    return this.defenceRequirementRows(defence).some((row) => !row.isMet);
  }

  protected shipHasZeroOwnedCount(ship: Ship): boolean {
    return this.currentShipAmount(ship.type) <= 0;
  }

  protected defenceHasZeroOwnedCount(defence: Defence): boolean {
    return this.currentDefenceAmount(defence.type) <= 0;
  }

  protected canBuildShip(ship: Ship): boolean {
    if (!this.planet || this.planet.info.ownerId === null) {
      return false;
    }

    if (this.buildingLevel(BuildingType.SHIPYARD) <= 0) {
      return false;
    }

    if (this.shipStartInFlightByType.has(ship.type)) {
      return false;
    }

    if (this.isShipQueueFull()) {
      return false;
    }

    const amount = this.shipAmount(ship.type);
    if (amount === null) {
      return false;
    }

    const totalCost = this.multiplyCost(ship.cost, amount);
    if (!this.hasEnoughResources(totalCost)) {
      return false;
    }

    if (!this.hasBuildingRequirements(ship.buildingRequirements, 1)) {
      return false;
    }

    if (!this.hasTechRequirements(ship.techRequirements, 1)) {
      return false;
    }

    return true;
  }

  protected canBuildDefence(defence: Defence): boolean {
    if (!this.planet || this.planet.info.ownerId === null) {
      return false;
    }

    if (this.buildingLevel(BuildingType.SHIPYARD) <= 0) {
      return false;
    }

    if (this.defenceStartInFlightByType.has(defence.type)) {
      return false;
    }

    if (this.isShipQueueFull()) {
      return false;
    }

    const amount = this.defenceAmount(defence.type);
    if (amount === null) {
      return false;
    }

    const totalCost = this.multiplyCost(defence.cost, amount);
    if (!this.hasEnoughResources(totalCost)) {
      return false;
    }

    if (!this.hasBuildingRequirements(defence.buildingRequirements, 1)) {
      return false;
    }

    if (!this.hasTechRequirements(defence.techRequirements, 1)) {
      return false;
    }

    if (this.wouldExceedBombDepotCapacity(defence.type, amount)) {
      return false;
    }

    return true;
  }

  protected shipBuildLabel(ship: Ship): string {
    if (this.isHeadShipQueueType(ship.type)) {
      return 'Order more';
    }

    return 'Build';
  }

  protected defenceBuildLabel(defence: Defence): string {
    if (this.isHeadDefenceQueueType(defence.type)) {
      return 'Order more';
    }

    return 'Build';
  }

  protected shipBuildTitle(ship: Ship): string {
    if (this.buildingLevel(BuildingType.SHIPYARD) <= 0) {
      return 'Build Shipyard first.';
    }

    if (this.isShipQueueFull()) {
      return 'Queue full. Upgrade COMPUTER_TECHNOLOGY and SHIPYARD to increase queue limit.';
    }

    if (this.shipStartInFlightByType.has(ship.type)) {
      return 'Adding to queue...';
    }

    if (!this.canBuildShip(ship)) {
      return 'Requirements not met or insufficient resources.';
    }

    return 'Add ship order to queue.';
  }

  protected defenceBuildTitle(defence: Defence): string {
    if (this.buildingLevel(BuildingType.SHIPYARD) <= 0) {
      return 'Build Shipyard first.';
    }

    if (this.isShipQueueFull()) {
      return 'Queue full. Upgrade COMPUTER_TECHNOLOGY and SHIPYARD to increase queue limit.';
    }

    if (this.defenceStartInFlightByType.has(defence.type)) {
      return 'Adding to queue...';
    }

    const amount = this.defenceAmount(defence.type);
    if (amount !== null && this.wouldExceedBombDepotCapacity(defence.type, amount)) {
      return 'Bomb Depot capacity reached. Increase BOMB_DEPOT production or free bomb storage first.';
    }

    if (!this.canBuildDefence(defence)) {
      return 'Requirements not met or insufficient resources.';
    }

    return 'Add defence order to queue.';
  }

  protected onBuildShip(ship: Ship): void {
    if (!this.canBuildShip(ship)) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    const amount = this.shipAmount(ship.type);
    if (!planet || !session || amount === null) {
      return;
    }

    this.shipStartInFlightByType.add(ship.type);
    this.shipStartErrorByType.delete(ship.type);
    this.cdr.markForCheck();

    const request: StartShipyardConstructionRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      itemKind: 'ship',
      shipType: ship.type,
      amount
    };

    this.gameApi.startShipyardConstruction(request, session.token)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.shipStartInFlightByType.delete(ship.type);
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedPlanet) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.shipStartErrorByType.set(
            ship.type,
            error?.error?.error ?? 'Unable to add ship order to queue.'
          );
          this.cdr.markForCheck();
        }
      });
  }

  protected onBuildDefence(defence: Defence): void {
    if (!this.canBuildDefence(defence)) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    const amount = this.defenceAmount(defence.type);
    if (!planet || !session || amount === null) {
      return;
    }

    this.defenceStartInFlightByType.add(defence.type);
    this.defenceStartErrorByType.delete(defence.type);
    this.cdr.markForCheck();

    const request: StartShipyardConstructionRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      itemKind: 'defence',
      defenceType: defence.type,
      amount
    };

    this.gameApi.startShipyardConstruction(request, session.token)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.defenceStartInFlightByType.delete(defence.type);
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedPlanet) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.defenceStartErrorByType.set(
            defence.type,
            error?.error?.error ?? 'Unable to add defence order to queue.'
          );
          this.cdr.markForCheck();
        }
      });
  }

  protected shipStartError(ship: Ship): string | null {
    return this.shipStartErrorByType.get(ship.type) ?? null;
  }

  protected defenceStartError(defence: Defence): string | null {
    return this.defenceStartErrorByType.get(defence.type) ?? null;
  }

  protected hasBuildingQueueEntries(): boolean {
    return (this.planet?.objects.buildingQueue?.length ?? 0) > 0;
  }

  protected currentBuildingQueueLength(): number {
    return this.planet?.objects.buildingQueue?.length ?? 0;
  }

  protected maxBuildingQueueLength(): number {
    const computerTechLevel = this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const roboticsFactoryLevel = this.buildingLevel(BuildingType.ROBOTICS_FACTORY);
    const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechLevel + roboticsFactoryLevel));
    return Math.max(1, Math.floor(rawLimit));
  }

  protected currentShipQueueLength(): number {
    return this.planet?.objects.shipyardQueue?.length ?? 0;
  }

  protected maxShipQueueLength(): number {
    const computerTechLevel = this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const shipyardLevel = this.buildingLevel(BuildingType.SHIPYARD);
    const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechLevel + shipyardLevel));
    return Math.max(1, Math.floor(rawLimit));
  }

  protected queueTabLabel(): string {
    return `Queues (B ${this.currentBuildingQueueLength()}/${this.maxBuildingQueueLength()} | SY ${this.currentShipQueueLength()}/${this.maxShipQueueLength()})`;
  }

  protected queueTabTitle(): string {
    return 'Building queue limit: upgrade COMPUTER_TECHNOLOGY and ROBOTICS_FACTORY. Ship queue limit: upgrade COMPUTER_TECHNOLOGY and SHIPYARD.';
  }

  protected buildingQueueRows(): BuildingQueueRowVm[] {
    const queueEntries = this.planet?.objects.buildingQueue ?? [];
    const industryPower = this.currentIndustryPower();
    let cumulativeRemaining = 0;

    return queueEntries.map((entry, index) => {
      const buildingType = this.queueEntryBuildingType(entry);
      const toLevel = this.queueEntryNextLevel(entry);
      const fromLevel = Math.max(0, toLevel - 1);
      const baseTotalConstructionTime = this.baseConstructionTime(buildingType, toLevel);
      const investedIndustryPower = Math.min(
        this.queueEntryInvestedIndustryPower(entry),
        baseTotalConstructionTime
      );
      const remaining = Math.max(0, baseTotalConstructionTime - investedIndustryPower);
      cumulativeRemaining += remaining;
      const estimatedTurnsForCompletion = industryPower > 0
        ? Math.ceil(cumulativeRemaining / industryPower)
        : null;

      return {
        queueIndex: index,
        position: index + 1,
        buildingType,
        fromLevel,
        toLevel,
        investedIndustryPower,
        baseTotalConstructionTime,
        estimatedTurnsForCompletion,
        isHeadOfQueue: index === 0
      };
    });
  }

  protected hasShipyardQueueEntries(): boolean {
    return (this.planet?.objects.shipyardQueue?.length ?? 0) > 0;
  }

  protected shipyardQueueRows(): ShipyardQueueRowVm[] {
    const queueEntries = this.planet?.objects.shipyardQueue ?? [];
    const shipyardPower = this.currentShipyardPower();
    let cumulativeRemaining = 0;
    const rows: ShipyardQueueRowVm[] = [];

    queueEntries.forEach((entry, index) => {
      const baseTotalConstructionTime = this.queueEntryBaseConstructionTime(entry);
      const remaining = Math.max(0, baseTotalConstructionTime - this.queueEntryInvestedShipyardPower(entry));
      cumulativeRemaining += remaining;
      const itemKind = this.queueEntryItemKind(entry);
      const amountTotal = this.queueEntryShipAmount(entry);
      const investedShipyardPower = this.queueEntryInvestedShipyardPower(entry);
      if (itemKind === 'ship') {
        const shipType = this.queueEntryShipType(entry);
        const singleShipBaseConstructionTime = this.baseShipConstructionTime(shipType, 1);
        const estimatedTurnsForCompletion = shipyardPower > 0
          ? Math.ceil(cumulativeRemaining / shipyardPower)
          : null;
        const amountCompleted = this.shipAmountCompleted(shipType, amountTotal, investedShipyardPower);
        rows.push({
          queueIndex: index,
          position: index + 1,
          itemKind,
          shipType,
          defenceType: null,
          amountCompleted,
          amountTotal,
          currentUnitInvestedShipyardPower: this.currentShipInvestedPower(
            amountCompleted,
            amountTotal,
            investedShipyardPower,
            singleShipBaseConstructionTime
          ),
          currentUnitBaseConstructionTime: singleShipBaseConstructionTime,
          estimatedTurnsForCompletion,
          isHeadOfQueue: index === 0
        });
        return;
      }

      const defenceType = this.queueEntryDefenceType(entry);
      const singleDefenceBaseConstructionTime = this.baseDefenceConstructionTime(defenceType, 1);
      const amountCompleted = this.defenceAmountCompleted(defenceType, amountTotal, investedShipyardPower);
      rows.push({
        queueIndex: index,
        position: index + 1,
        itemKind,
        shipType: null,
        defenceType,
        amountCompleted,
        amountTotal,
        currentUnitInvestedShipyardPower: this.currentShipInvestedPower(
          amountCompleted,
          amountTotal,
          investedShipyardPower,
          singleDefenceBaseConstructionTime
        ),
        currentUnitBaseConstructionTime: singleDefenceBaseConstructionTime,
        estimatedTurnsForCompletion: shipyardPower > 0 ? Math.ceil(cumulativeRemaining / shipyardPower) : null,
        isHeadOfQueue: index === 0
      });
    });

    return rows;
  }

  protected buildingQueueDropListId(): string {
    return `planet-building-queue:${this.coordinatesLabel}`;
  }

  protected shipyardQueueDropListId(): string {
    return `planet-shipyard-queue:${this.coordinatesLabel}`;
  }

  protected isBuildingQueueInteractionDisabled(): boolean {
    return this.buildingQueueMutationInFlight;
  }

  protected isShipyardQueueInteractionDisabled(): boolean {
    return this.shipyardQueueMutationInFlight;
  }

  protected buildingQueueCancelTitle(row: BuildingQueueRowVm): string {
    if (row.investedIndustryPower <= 0) {
      return 'Cancel and refund 100% of this queued building.';
    }

    return 'Cancel and refund 75% of this started building.';
  }

  protected shipyardQueueItemLabel(row: ShipyardQueueRowVm): string {
    return row.itemKind === 'defence' ? (row.defenceType ?? 'Unknown defence') : (row.shipType ?? 'Unknown ship');
  }

  protected shipyardQueueItemTypeLabel(row: ShipyardQueueRowVm): string {
    return row.itemKind === 'defence' ? 'Defence' : 'Ship';
  }

  protected shipyardQueueCancelTitle(row: ShipyardQueueRowVm): string {
    if (row.amountCompleted > 0) {
      return 'Cancel: completed units are delivered and unfinished remainder is refunded at 75%.';
    }

    if (row.currentUnitInvestedShipyardPower <= 0) {
      return 'Cancel and refund 100% of this queued stack.';
    }

    return 'Cancel and refund 75% of the unfinished remainder.';
  }

  protected onBuildingQueueDrop(event: CdkDragDrop<BuildingQueueRowVm[]>): void {
    if (event.previousIndex === event.currentIndex || this.buildingQueueMutationInFlight) {
      return;
    }

    const rows = this.buildingQueueRows();
    const movedRow = rows[event.previousIndex];
    const targetRow = rows[event.currentIndex];
    const planet = this.planet;
    const session = this.playerSession.load();
    if (!movedRow || !targetRow || !planet || !session) {
      return;
    }

    const request: ReorderBuildingQueueRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      fromIndex: movedRow.queueIndex,
      toIndex: targetRow.queueIndex
    };

    this.buildingQueueMutationInFlight = true;
    this.buildingQueueActionError = null;
    this.cdr.markForCheck();

    this.gameApi.reorderBuildingQueue(request, session.token)
      .pipe(finalize(() => {
        this.buildingQueueMutationInFlight = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (updatedPlanet) => {
          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.buildingQueueActionError = error?.error?.error ?? 'Unable to reorder building queue.';
          this.cdr.markForCheck();
        }
      });
  }

  protected onCancelBuildingQueue(row: BuildingQueueRowVm): void {
    if (this.buildingQueueMutationInFlight) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    if (!planet || !session) {
      return;
    }

    const request: CancelBuildingQueueEntryRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      index: row.queueIndex
    };

    this.buildingQueueMutationInFlight = true;
    this.buildingQueueActionError = null;
    this.cdr.markForCheck();

    this.gameApi.cancelBuildingQueueEntry(request, session.token)
      .pipe(finalize(() => {
        this.buildingQueueMutationInFlight = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (updatedPlanet) => {
          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.buildingQueueActionError = error?.error?.error ?? 'Unable to cancel building queue entry.';
          this.cdr.markForCheck();
        }
      });
  }

  protected onShipyardQueueDrop(event: CdkDragDrop<ShipyardQueueRowVm[]>): void {
    if (event.previousIndex === event.currentIndex || this.shipyardQueueMutationInFlight) {
      return;
    }

    const rows = this.shipyardQueueRows();
    const movedRow = rows[event.previousIndex];
    const targetRow = rows[event.currentIndex];
    const planet = this.planet;
    const session = this.playerSession.load();
    if (!movedRow || !targetRow || !planet || !session) {
      return;
    }

    const request: ReorderShipyardQueueRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      fromIndex: movedRow.queueIndex,
      toIndex: targetRow.queueIndex
    };

    this.shipyardQueueMutationInFlight = true;
    this.shipyardQueueActionError = null;
    this.cdr.markForCheck();

    this.gameApi.reorderShipyardQueue(request, session.token)
      .pipe(finalize(() => {
        this.shipyardQueueMutationInFlight = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (updatedPlanet) => {
          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.shipyardQueueActionError = error?.error?.error ?? 'Unable to reorder shipyard queue.';
          this.cdr.markForCheck();
        }
      });
  }

  protected onCancelShipyardQueue(row: ShipyardQueueRowVm): void {
    if (this.shipyardQueueMutationInFlight) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    if (!planet || !session) {
      return;
    }

    const request: CancelShipyardQueueEntryRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      index: row.queueIndex
    };

    this.shipyardQueueMutationInFlight = true;
    this.shipyardQueueActionError = null;
    this.cdr.markForCheck();

    this.gameApi.cancelShipyardQueueEntry(request, session.token)
      .pipe(finalize(() => {
        this.shipyardQueueMutationInFlight = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (updatedPlanet) => {
          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.shipyardQueueActionError = error?.error?.error ?? 'Unable to cancel shipyard queue entry.';
          this.cdr.markForCheck();
        }
      });
  }

  protected hasResearchQueueEntries(): boolean {
    return this.researchQueueRows().length > 0;
  }

  protected researchQueueRows(): ResearchQueueRowVm[] {
    const rows: ResearchQueueRowVm[] = [];
    const currentResearchQueue = this.planet?.objects.currentResearchQueue;
    if (currentResearchQueue) {
      const toLevel = this.queueEntryResearchNextLevel(currentResearchQueue);
      const fromLevel = Math.max(0, toLevel - 1);
      const helperLabs = this.queueEntryHelperLabs(currentResearchQueue);
      const investedResearchPower = this.queueEntryInvestedResearchPower(currentResearchQueue);
      const baseTotalResearchTime = this.baseResearchTime(
        this.queueEntryTechnologyType(currentResearchQueue),
        toLevel
      );
      const remainingResearchTime = Math.max(0, baseTotalResearchTime - investedResearchPower);
      const estimatedTurnsForCompletion = this.currentResearchPower() > 0
        ? Math.ceil(remainingResearchTime / this.currentResearchPower())
        : null;

      rows.push({
        position: rows.length + 1,
        role: 'Main lab',
        technologyType: this.queueEntryTechnologyType(currentResearchQueue),
        levelLabel: `L${fromLevel} -> L${toLevel}`,
        helperLabsLabel: String(helperLabs.length),
        targetLabel: '--',
        status: 'Researching',
        investedLabel: `${investedResearchPower} / ${baseTotalResearchTime}`,
        etaLabel: estimatedTurnsForCompletion === null ? '--' : String(estimatedTurnsForCompletion)
      });
    }

    const helperReference = this.planet?.objects.researchHelperFor;
    if (helperReference) {
      rows.push({
        position: rows.length + 1,
        role: 'Helper lab',
        technologyType: helperReference.technologyType as TechnologyType,
        levelLabel: '--',
        helperLabsLabel: '--',
        targetLabel: this.coordinatesToLabel(helperReference.mainResearchCoordinates),
        status: 'Helping',
        investedLabel: '--',
        etaLabel: '--'
      });
    }

    return rows;
  }

  protected planetaryParameterRows(): Array<{ label: string; value: number }> {
    const parameters = this.planet?.info.planetaryParameters;
    if (!parameters) {
      return [];
    }

    return [
      { label: 'Metal modifier', value: parameters.metalModifier },
      { label: 'Crystal modifier', value: parameters.crystalModifier },
      { label: 'Deuterium modifier', value: parameters.deuteriumModifier },
      { label: 'Energy modifier RES', value: parameters.energyModifierRES },
      { label: 'Energy modifier Nuclear', value: parameters.energyModifierNuclear },
      { label: 'Science modifier', value: parameters.scienceModifier },
      { label: 'Industry modifier', value: parameters.industryModifier },
      { label: 'Anomalies and Noise', value: parameters.anomaliesAndNoise },
      { label: 'Hyperspace parameters', value: parameters.hyperspaceParameters }
    ];
  }

  protected usedPlanetSize(): number {
    let used = 0;
    for (const level of this.buildingLevelsByType.values()) {
      used += level;
    }

    return used;
  }

  protected hasTradePort(): boolean {
    return this.buildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT) > 0;
  }

  protected tradePortOffers(): TradePortOfferDto[] {
    return this.planet?.objects.tradePortOffers ?? [];
  }

  protected openTradePortDialog(): void {
    if (!this.hasTradePort()) {
      return;
    }

    this.tradePortActionError = null;
    this.isTradePortDialogOpen = true;
  }

  protected closeTradePortDialog(): void {
    this.isTradePortDialogOpen = false;
    this.tradePortActionError = null;
    this.tradePortActionOfferId = null;
  }

  protected tradePortOfferGetLabel(offer: TradePortOfferDto): string {
    return `Get ${offer.getAmount} ${tradeResourceLabel(offer.getResourceType)}`;
  }

  protected tradePortOfferCostLabel(offer: TradePortOfferDto): string {
    return `${offer.totalCost} ${tradeResourceLabel(offer.costResourceType)}`;
  }

  protected tradePortResourceIconPath(resourceType: TradeResourceType): string {
    switch (resourceType) {
      case 'metal':
        return 'images/icons/small/metal.png';
      case 'crystal':
        return 'images/icons/small/crystal.png';
      case 'deuterium':
        return 'images/icons/small/deuter.png';
      default:
        return '';
    }
  }

  protected tradePortResourceLabel(resourceType: TradeResourceType): string {
    return tradeResourceLabel(resourceType);
  }

  protected tradePortOfferModifierLabel(offer: TradePortOfferDto): string {
    return `(${offer.costModifierPercent >= 0 ? '+' : ''}${offer.costModifierPercent}%)`;
  }

  protected canUseTradePortOffer(offer: TradePortOfferDto): boolean {
    if (!this.planet || offer.used || this.tradePortActionOfferId !== null) {
      return false;
    }

    if (offer.totalCost === 0) {
      return true;
    }

    return (this.planet.objects.resources[offer.costResourceType] ?? 0) >= offer.totalCost;
  }

  protected tradePortOfferActionTitle(offer: TradePortOfferDto): string {
    if (offer.used) {
      return 'This offer was already used this turn.';
    }

    if (this.tradePortActionOfferId !== null) {
      return 'Processing trade offer...';
    }

    if (!this.planet) {
      return 'Planet data not loaded.';
    }

    if (offer.totalCost === 0) {
      return 'This offer is free.';
    }

    if ((this.planet.objects.resources[offer.costResourceType] ?? 0) < offer.totalCost) {
      return 'Not enough local resources for this offer.';
    }

    return 'Exchange resources instantly on this planet.';
  }

  protected useTradePortOffer(offer: TradePortOfferDto): void {
    const planet = this.planet;
    const session = this.playerSession.load();
    if (!planet || !session || !this.canUseTradePortOffer(offer)) {
      return;
    }

    this.tradePortActionOfferId = offer.offerId;
    this.tradePortActionError = null;
    this.cdr.markForCheck();

    const request: UseTradePortOfferRequest = {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      offerId: offer.offerId
    };

    this.gameApi.useTradePortOffer(request, session.token)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.tradePortActionOfferId = null;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updatedPlanet) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== request.x
            || this.planet.coordinates.y !== request.y
            || this.planet.coordinates.z !== request.z
          ) {
            return;
          }

          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.tradePortActionError = error?.error?.error ?? 'Unable to use trade offer.';
          this.cdr.markForCheck();
        }
      });
  }

  protected attentionLabels(): string[] {
    return this.currentPlanetAttentionLabels();
  }

  protected planetHeaderIndicators(): ResourceHeaderIndicator[] {
    const currentPlanet = this.planet;
    return this.ownedPlanets.map((planet) => ({
      label: '•',
      isCurrent: currentPlanet ? this.sameCoordinates(currentPlanet.coordinates, planet.coordinates) : false,
      tone: currentPlanet && this.sameCoordinates(currentPlanet.coordinates, planet.coordinates)
        ? this.headerIndicatorToneFromLabels(this.currentPlanetAttentionLabels())
        : this.headerIndicatorToneForPlanet(planet),
      queryParams: {
        x: planet.coordinates.x,
        y: planet.coordinates.y,
        z: planet.coordinates.z
      },
      title: `${planet.basicInfo.name} (${this.coordinatesLabelForPlanet(planet)})`
    }));
  }

  protected navigateToPreviousPlanet(): void {
    const target = this.relativeOwnedPlanet(-1);
    if (!target) {
      return;
    }

    void this.router.navigate(['/game/planet'], {
      queryParams: {
        x: target.coordinates.x,
        y: target.coordinates.y,
        z: target.coordinates.z
      }
    });
  }

  protected navigateToNextPlanet(): void {
    const target = this.relativeOwnedPlanet(1);
    if (!target) {
      return;
    }

    void this.router.navigate(['/game/planet'], {
      queryParams: {
        x: target.coordinates.x,
        y: target.coordinates.y,
        z: target.coordinates.z
      }
    });
  }

  protected buildingCostHeader(building: Building): string {
    return this.buildingLevel(building.type) <= 0
      ? 'Initial cost'
      : `Next level cost (L${this.buildingNextLevel(building)})`;
  }

  protected buildingCostRows(building: Building): BuildingCostRowVm[] {
    const currentResources = this.planet?.objects.resources;
    const cost = this.buildingNextLevelCost(building);

    return [
      {
        label: 'Metal',
        amount: cost.metal,
        isEnough: (currentResources?.metal ?? 0) >= cost.metal
      },
      {
        label: 'Crystal',
        amount: cost.crystal,
        isEnough: (currentResources?.crystal ?? 0) >= cost.crystal
      },
      {
        label: 'Deuterium',
        amount: cost.deuterium,
        isEnough: (currentResources?.deuterium ?? 0) >= cost.deuterium
      }
    ];
  }

  protected buildingRequirementRows(building: Building): BuildingRequirementRowVm[] {
    const targetLevel = this.buildingNextLevel(building);
    const rows: BuildingRequirementRowVm[] = [];

    for (const requirement of building.buildingRequirements) {
        const requiredLevel = Math.ceil(targetLevel * requirement.level);
        const currentLevel = this.buildingLevel(requirement.building);
        rows.push({
          label: `${requirement.building}: ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel,
          isPlaceholder: false
        });
    }

    for (const requirement of building.techRequirements) {
        const requiredLevel = Math.ceil(targetLevel * requirement.level);
        const currentLevel = this.techLevel(requirement.tech);
        rows.push({
          label: `${requirement.tech} (Tech): ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel,
          isPlaceholder: false
        });
    }

    if (rows.length === 0) {
      return [
        {
          label: 'None',
          isMet: true,
          isPlaceholder: true
        }
      ];
    }

    return rows;
  }

  protected resourceCostIconPath(label: string): string {
    switch (label) {
      case 'Metal':
        return 'images/icons/small/metal.png';
      case 'Crystal':
        return 'images/icons/small/crystal.png';
      case 'Deuterium':
        return 'images/icons/small/deuter.png';
      default:
        return '';
    }
  }

  private createBuildingDetailDialogData(building: Building): PlanetObjectDetailDialogData {
    const currentLevel = this.buildingLevel(building.type);
    const maxPower = this.buildingMaxPowerConsumption(building);
    const currentPower = this.buildingCurrentPowerConsumption(building);
    const summaryRows: PlanetObjectDetailRow[] = [
      {
        label: 'Category',
        value: building.isFacility ? 'Facility' : 'Resource building'
      },
      {
        label: 'Base armor',
        value: String(building.armor)
      },
      {
        label: 'Damage multiplier',
        value: `${this.roundNumber(building.damageMultiplier, 2)}x`
      }
    ];

    if (building.production1.length > 0) {
      summaryRows.push({
        label: currentLevel > 0 ? 'Current output' : 'Level 1 output',
        value: String(currentLevel > 0 ? this.buildingProductionAtCurrentLevel(building) : this.getProductionAtLevel(building, 1))
      });
    }

    if (building.powerConsumption > 0) {
      summaryRows.push({
        label: 'Power per level',
        value: String(building.powerConsumption)
      });
    } else {
      summaryRows.push({
        label: 'Power',
        value: 'No direct power draw',
        tone: 'muted'
      });
    }

    const stateRows: PlanetObjectDetailRow[] = [
      {
        label: 'Current level',
        value: String(currentLevel)
      },
      {
        label: 'Next level',
        value: `L${this.buildingNextLevel(building)}`
      }
    ];

    if (currentLevel <= 0) {
      stateRows.push({
        label: 'Status',
        value: 'Not built yet',
        tone: 'muted'
      });
    } else {
      if (building.production1.length > 0) {
        stateRows.push({
          label: 'Current production',
          value: String(this.buildingProductionAtCurrentLevel(building))
        });
      }

      stateRows.push(
        {
          label: 'Structural points',
          value: `${this.buildingCurrentStructuralPoints(building)} / ${this.buildingMaxStructuralPoints(building)}`
        },
        {
          label: 'Structural efficiency',
          value: `${this.buildingStructuralUtilizationPercent(building)}%`
        }
      );

      if (maxPower > 0) {
        stateRows.push({
          label: 'Power usage',
          value: `${currentPower} / ${maxPower}`,
          tone: currentPower < maxPower ? 'warn' : 'default'
        });
      }
    }

    const sections: PlanetObjectDetailSection[] = [
      this.createDetailSection('Summary', summaryRows),
      this.createDetailSection('Current state', stateRows),
      this.createDetailSection(this.buildingCostHeader(building), this.detailRowsFromCostRows(this.buildingCostRows(building))),
      this.createDetailSection('Requirements', this.detailRowsFromRequirementRows(this.buildingRequirementRows(building)))
    ];

    return this.buildPlanetObjectDialogData('Building', building.type, building.description, building.imagePath, sections);
  }

  private createShipDetailDialogData(ship: Ship): PlanetObjectDetailDialogData {
    const counts = this.shipCounts(ship.type);
    const sections: PlanetObjectDetailSection[] = [
      this.createDetailSection('Summary', [
        {
          label: 'Hull class',
          value: ship.hullClass
        },
        {
          label: 'Purposes',
          value: Array.from(ship.purposes).join(', ') || 'None'
        },
        {
          label: 'Size',
          value: String(ship.size)
        },
        {
          label: 'Cargo',
          value: String(ship.cargoCapacity)
        },
        {
          label: 'Hangar',
          value: String(ship.hangarCapacity)
        },
        {
          label: 'Jump capable',
          value: ship.canJump ? 'Yes' : 'No',
          tone: ship.canJump ? 'good' : 'muted'
        },
        {
          label: 'Jump cost',
          value: ship.canJump ? String(ship.jumpCost) : 'N/A',
          tone: ship.canJump ? 'default' : 'muted'
        }
      ]),
      this.createDetailSection('Current state', [
        {
          label: 'Owned on planet',
          value: String(counts.total)
        },
        {
          label: 'Undamaged',
          value: String(counts.undamaged)
        },
        {
          label: 'Damaged',
          value: String(counts.damaged),
          tone: counts.damaged > 0 ? 'warn' : 'default'
        },
        {
          label: 'Missing hull',
          value: String(counts.missingHull),
          tone: counts.missingHull > 0 ? 'warn' : 'muted'
        }
      ]),
      this.createDetailSection('Combat', [
        {
          label: 'Hull points',
          value: String(ship.hullPointsCapacity)
        },
        {
          label: 'Shield',
          value: String(ship.shieldCapacity)
        },
        {
          label: 'Armor',
          value: String(ship.armor)
        },
        {
          label: 'Critical threshold',
          value: `${ship.criticalThreshold}%`
        },
        {
          label: 'Evasion',
          value: `${Math.round(ship.evasionChance * 100)}%`
        }
      ]),
      this.createDetailSection('Weapons', this.detailRowsFromWeapons(ship.weapons)),
      this.createDetailSection('Single ship cost', this.detailRowsFromCostRows(this.shipSingleCostRows(ship))),
      this.createDetailSection('Requirements', this.detailRowsFromRequirementRows(this.shipRequirementRows(ship)))
    ];

    return this.buildPlanetObjectDialogData('Ship', ship.type, '', ship.imagePath, sections);
  }

  private createDefenceDetailDialogData(defence: Defence): PlanetObjectDetailDialogData {
    const counts = this.defenceCounts(defence.type);
    const isPlanetaryBomb = defence.hullClass === HullClass.PLANETARY_BOMB;
    const stateRows: PlanetObjectDetailRow[] = [
      {
        label: 'Owned on planet',
        value: String(counts.total)
      },
      {
        label: 'Undamaged',
        value: String(counts.undamaged)
      },
      {
        label: 'Damaged',
        value: String(counts.damaged),
        tone: counts.damaged > 0 ? 'warn' : 'default'
      },
      {
        label: 'Missing hull',
        value: String(counts.missingHull),
        tone: counts.missingHull > 0 ? 'warn' : 'muted'
      }
    ];

    if (isPlanetaryBomb) {
      stateRows.push({
        label: 'Bomb depot storage',
        value: `${this.currentPlanetaryBombCount()} / ${this.bombDepotCapacity()}${this.queuedPlanetaryBombCount() > 0 ? ` (+${this.queuedPlanetaryBombCount()} queued)` : ''}`,
        tone: 'warn'
      });
    }

    const sections: PlanetObjectDetailSection[] = [
      this.createDetailSection('Summary', [
        {
          label: 'Hull class',
          value: defence.hullClass
        },
        {
          label: 'Role',
          value: isPlanetaryBomb ? 'Stored bomb payload' : 'Planetary defence platform'
        },
        {
          label: 'Size',
          value: String(defence.size)
        },
        {
          label: 'Can shoot to orbit',
          value: defence.canShootToOrbit ? 'Yes' : 'No',
          tone: defence.canShootToOrbit ? 'good' : 'muted'
        }
      ]),
      this.createDetailSection('Current state', stateRows),
      this.createDetailSection('Combat', [
        {
          label: 'Hull points',
          value: String(defence.hullPointsCapacity)
        },
        {
          label: 'Shield',
          value: String(defence.shieldCapacity)
        },
        {
          label: 'Armor',
          value: String(defence.armor)
        },
        {
          label: 'Critical threshold',
          value: `${defence.criticalThreshold}%`
        }
      ]),
      this.createDetailSection('Weapons', this.detailRowsFromWeapons(defence.weapons)),
      this.createDetailSection('Single defence cost', this.detailRowsFromCostRows(this.defenceSingleCostRows(defence))),
      this.createDetailSection('Requirements', this.detailRowsFromRequirementRows(this.defenceRequirementRows(defence)))
    ];

    return this.buildPlanetObjectDialogData('Defence', defence.type, '', defence.imagePath, sections);
  }

  private buildPlanetObjectDialogData(
    kindLabel: string,
    title: string,
    description: string,
    imagePath: string,
    sections: PlanetObjectDetailSection[]
  ): PlanetObjectDetailDialogData {
    return {
      kindLabel,
      title,
      subtitle: `${this.planet?.basicInfo.name ?? 'Planet View'} | ${kindLabel}`,
      description,
      previewImagePath: imagePath,
      rawImagePath: toRawImagePath(imagePath),
      sections: sections.filter((section) => section.rows.length > 0)
    };
  }

  private createDetailSection(title: string, rows: PlanetObjectDetailRow[]): PlanetObjectDetailSection {
    return {
      title,
      rows
    };
  }

  private detailRowsFromCostRows(rows: BuildingCostRowVm[]): PlanetObjectDetailRow[] {
    return rows.map((row) => ({
      label: row.label,
      value: String(row.amount),
      tone: row.isEnough ? 'default' : 'bad'
    }));
  }

  private detailRowsFromRequirementRows(rows: BuildingRequirementRowVm[]): PlanetObjectDetailRow[] {
    return rows.map((row) => {
      if (row.isPlaceholder) {
        return {
          label: 'Requirement',
          value: row.label,
          tone: 'muted'
        };
      }

        const separatorIndex = row.label.indexOf(':');
        const rawLabel = separatorIndex >= 0 ? row.label.slice(0, separatorIndex).trim() : row.label;
        const value = separatorIndex >= 0 ? row.label.slice(separatorIndex + 1).trim() : (row.isMet ? 'Met' : 'Missing');

        return {
          label: rawLabel,
          value,
          tone: row.isMet ? 'good' : 'bad'
        };
      });
  }

  private detailRowsFromWeapons(weapons: Weapon[]): PlanetObjectDetailRow[] {
    if (weapons.length <= 0) {
      return [
        {
          label: 'Loadout',
          value: 'None',
          tone: 'muted'
        }
      ];
    }

    return weapons.map((weapon, index) => ({
      label: weapons.length === 1 ? weapon.type : `${weapon.type} ${index + 1}`,
      value: `${weapon.shots} x ${weapon.dmg}`
    }));
  }

  private shipCounts(shipType: ShipType): {
    total: number;
    undamaged: number;
    damaged: number;
    missingHull: number;
  } {
    const total = ManyShips.countByType(this.planet?.objects.ships).get(shipType) ?? 0;
    const undamaged = ManyShips.undamagedCountByType(this.planet?.objects.ships).get(shipType) ?? 0;
    const damagedEntry = ManyShips.groupedDamagedEntries(this.planet?.objects.ships)
      .find((entry) => entry.type === shipType);

    return {
      total,
      undamaged,
      damaged: damagedEntry?.amount ?? 0,
      missingHull: damagedEntry?.totalMissingHull ?? 0
    };
  }

  private defenceCounts(defenceType: DefenceType): {
    total: number;
    undamaged: number;
    damaged: number;
    missingHull: number;
  } {
    const total = ManyDefences.countByType(this.planet?.objects.defences).get(defenceType) ?? 0;
    const undamaged = ManyDefences.undamagedCountByType(this.planet?.objects.defences).get(defenceType) ?? 0;
    const damagedEntry = ManyDefences.groupedDamagedEntries(this.planet?.objects.defences)
      .find((entry) => entry.type === defenceType);

    return {
      total,
      undamaged,
      damaged: damagedEntry?.amount ?? 0,
      missingHull: damagedEntry?.totalMissingHull ?? 0
    };
  }

  private matchesShipPurposeFilter(ship: Ship): boolean {
    const enabledPurposes = Array.from(this.shipPurposeFilters.entries())
      .filter(([, enabled]) => enabled)
      .map(([purpose]) => purpose);

    if (enabledPurposes.length === 0) {
      return false;
    }

    return enabledPurposes.some((purpose) => ship.purposes.has(purpose));
  }

  private matchesDefenceFilter(defence: Defence): boolean {
    const isPlanetaryBomb = isPlanetaryBombDefenceType(defence.type) || defence.hullClass === HullClass.PLANETARY_BOMB;
    const matchesRegularDefence = this.showRegularDefences && !isPlanetaryBomb;
    const matchesPlanetaryBomb = this.showPlanetaryBombDefences && isPlanetaryBomb;

    return matchesRegularDefence || matchesPlanetaryBomb;
  }

  private loadPlanet(x: number, y: number, z: number): void {
    this.stopQueueTabAutoRefresh();
    this.currentPlanetRequestKey += 1;
    const requestKey = this.currentPlanetRequestKey;
    this.isTradePortDialogOpen = false;
    this.selectedObjectDetails = null;
    this.tradePortActionError = null;
    this.tradePortActionOfferId = null;

    const session = this.playerSession.load();
    if (!session) {
      this.isLoading = false;
      this.loadError = 'No player session found. Start a new game.';
      this.planet = null;
      this.cdr.markForCheck();
      return;
    }

    this.pendingPlanetRequests += 1;
    this.isLoading = this.pendingPlanetRequests > 0;
    this.loadError = null;
    this.cdr.markForCheck();
    this.armLoadingSafetyTimeout(requestKey);

    forkJoin({
      planet: this.gameApi.getClientPlanet(x, y, z, session.token, { ownedOnly: true }),
      ownedPlanets: this.gameApi.getOwnedPlanets(session.token),
      activeFleets: this.gameApi.getActiveFleets(session.token)
    })
      .pipe(
        timeout(10000),
        finalize(() => {
          if (this.currentPlanetRequestKey === requestKey) {
            this.clearLoadingSafetyTimeout();
          }

          this.pendingPlanetRequests = Math.max(0, this.pendingPlanetRequests - 1);
          this.isLoading = this.pendingPlanetRequests > 0;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ planet, ownedPlanets, activeFleets }) => {
          if (this.currentPlanetRequestKey !== requestKey) {
            return;
          }

          try {
            if (!planet.info.isOwnedByViewer) {
              this.loadError = 'Planet view is available only for your own planets.';
              this.planet = null;
              this.cdr.markForCheck();
              return;
            }

            this.planet = planet;
            this.ownedPlanets = this.sortOwnedPlanets(ownedPlanets);
            this.activeFleets = [...activeFleets];
            this.coordinatesLabel = `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}`;
            this.activeTab = 'resources';
            this.shipAmountInputs.clear();
            this.rebuildPlanetState();
            this.tutorialService.autoOpenTutorial('planetView');
            this.cdr.markForCheck();
          } catch {
            this.loadError = 'Unable to process planet data.';
            this.planet = null;
            this.cdr.markForCheck();
          }
        },
        error: (error: { error?: { error?: string } }) => {
          if (this.currentPlanetRequestKey !== requestKey) {
            return;
          }

          this.loadError = error?.error?.error ?? 'Unable to load planet from server.';
          this.planet = null;
          this.cdr.markForCheck();
        }
      });
  }

  private rebuildPlanetState(): void {
    this.buildingLevelsByType.clear();
    this.buildingCurrentPowerByType.clear();
    this.buildingCurrentStructuralPointsByType.clear();
    this.powerUpdateInFlightByType.clear();
    this.powerUpdateErrorByType.clear();
    this.buildingStartInFlightByType.clear();
    this.buildingStartErrorByType.clear();
    this.shipStartInFlightByType.clear();
    this.shipStartErrorByType.clear();
    this.defenceStartInFlightByType.clear();
    this.defenceStartErrorByType.clear();
    this.buildingQueueActionError = null;
    this.shipyardQueueActionError = null;
    this.buildingQueueMutationInFlight = false;
    this.shipyardQueueMutationInFlight = false;
    this.techLevelsByType.clear();
    this.buildingQueueTypes.clear();

    if (!this.planet) {
      return;
    }

    for (const entry of this.planet.objects.buildingsLevels) {
      this.buildingLevelsByType.set(entry.type as BuildingType, entry.level);
    }

    for (const entry of this.planet.objects.buildingsCurrentPowerConsumption ?? []) {
      this.buildingCurrentPowerByType.set(
        entry.type as BuildingType,
        this.roundNumber(Math.max(0, entry.currentPowerConsumption), 2)
      );
    }

    for (const entry of this.planet.objects.buildingsCurrentStructuralPoints ?? []) {
      this.buildingCurrentStructuralPointsByType.set(
        entry.type as BuildingType,
        Math.max(0, Math.floor(entry.currentStructuralPoints))
      );
    }

    for (const queued of this.planet.objects.buildingQueue) {
      this.buildingQueueTypes.add(this.queueEntryBuildingType(queued));
    }

    for (const entry of this.planet.reportData?.techLevels ?? []) {
      this.techLevelsByType.set(entry.type as TechnologyType, entry.level);
    }

    this.initializeBuildingCurrentPowerConsumption();
    this.updateResourceDisplays();
  }

  private prepareTutorialStep(targetId: string | undefined): void {
    const targetTab = this.tabForTutorialTarget(targetId);
    if (!targetTab || this.activeTab === targetTab) {
      return;
    }

    this.setTab(targetTab);
    this.cdr.detectChanges();
  }

  private tabForTutorialTarget(targetId: string | undefined): PlanetTab | null {
    switch (targetId) {
      case 'planet-queues-grid':
        return 'queues';
      case 'planet-summary':
      case 'planet-overview':
      case 'planet-navigation':
      case 'planet-tab-bar':
      case 'planet-resource-card':
        return 'resources';
      default:
        return null;
    }
  }

  private updateResourceDisplays(): void {
    if (!this.planet) {
      this.metalDisplay = null;
      this.crystalDisplay = null;
      this.deuteriumDisplay = null;
      this.energyDisplay = null;
      this.energyTooltip = null;
      this.powersDisplay = null;
      return;
    }

    const adaptiveTechLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const resources = this.planet.objects.resources;
    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);
    const energyEfficiency = energyDeficitEfficiencyMultiplier(energy.available, energy.used);

    const metalCapacity = this.storageCapacity(BuildingType.METAL_STORAGE);
    const crystalCapacity = this.storageCapacity(BuildingType.CRYSTAL_STORAGE);
    const deuteriumCapacity = this.storageCapacity(BuildingType.DEUTERIUM_TANK);

    this.metalDisplay = {
      current: resources.metal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.METAL_MINE, adaptiveTechLevel, this.planet.info.planetaryParameters.metalModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.metal, metalCapacity)
    };

    this.crystalDisplay = {
      current: resources.crystal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.CRYSTAL_MINE, adaptiveTechLevel, this.planet.info.planetaryParameters.crystalModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.crystal, crystalCapacity)
    };

    this.deuteriumDisplay = {
      current: resources.deuterium,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.DEUTERIUM_SYNTHESIZER, adaptiveTechLevel, this.planet.info.planetaryParameters.deuteriumModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.deuterium, deuteriumCapacity)
    };
    this.energyDisplay = {
      used: energy.used,
      available: energy.available
    };
    this.energyTooltip = this.energyPenaltyTooltip(energy.available, energy.used);

    this.powersDisplay = {
      industryPower: this.currentIndustryPower(),
      shipyardPower: this.currentShipyardPower(),
      researchPower: this.currentResearchPower(),
      shipRepair: this.currentShipRepairCapability(),
      industryRepair: this.currentIndustryRepairCapability(),
      droneRepair: this.currentDroneRepairCapability(),
      industryPowerLimited: (
        this.isBuildingNotUsingFullPower(BuildingType.ROBOTICS_FACTORY)
        || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY)
      ),
      shipyardPowerLimited: (
        this.isBuildingNotUsingFullPower(BuildingType.SHIPYARD)
        || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY)
      ),
      researchPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.RESEARCH_LAB)
    };
  }

  private capacityPercent(current: number, capacity: number): number | null {
    if (capacity <= 0) {
      return null;
    }

    return this.roundNumber((current / capacity) * 100, 1);
  }

  private resourceGain(buildingType: BuildingType, adaptiveTechLevel: number, modifier: number): number {
    const baseProduction = this.getProductionAtLevelByType(buildingType, this.buildingLevel(buildingType));
    const gain = baseProduction * (1 + adaptiveTechLevel / 100) * modifier;
    return Number.isFinite(gain) ? Math.floor(gain) : 0;
  }

  private storageCapacity(storageType: BuildingType): number {
    return this.getProductionAtLevelByType(storageType, this.buildingLevel(storageType));
  }

  private calculateEnergyState(
    levels: Map<BuildingType, number>,
    currentPowerByType: Map<BuildingType, number>
  ): EnergyState {
    const solarProduction = this.getProductionAtLevelByType(
      BuildingType.SOLAR_WIND_GEOTHERMAL,
      levels.get(BuildingType.SOLAR_WIND_GEOTHERMAL) ?? 0
    );
    const nuclearProduction = this.getProductionAtLevelByType(
      BuildingType.NUCLEAR_PLANT,
      levels.get(BuildingType.NUCLEAR_PLANT) ?? 0
    );
    const fusionProduction = this.getProductionAtLevelByType(
      BuildingType.FUSION_REACTOR,
      levels.get(BuildingType.FUSION_REACTOR) ?? 0
    );

    const parameters = this.planet?.info.planetaryParameters;
    const energyModifierRES = parameters?.energyModifierRES ?? 1;
    const energyModifierNuclear = parameters?.energyModifierNuclear ?? 1;
    const energyTechLevel = this.techLevel(TechnologyType.ENERGY_TECHNOLOGY);

    const availableEnergy = (
      (solarProduction * energyModifierRES)
      + (nuclearProduction * energyModifierNuclear)
      + fusionProduction
    ) * (1 + ((energyTechLevel * 2) / 100));

    let usedEnergy = 0;
    for (const [buildingType, level] of levels.entries()) {
      if (level <= 0) {
        continue;
      }

      const blueprint = this.buildingBlueprintsByType.get(buildingType);
      if (!blueprint) {
        continue;
      }

      const maxConsumption = Math.max(0, level * (blueprint.powerConsumption ?? 0));
      const selectedConsumption = currentPowerByType.get(buildingType);
      const normalizedConsumption = selectedConsumption === undefined
        ? maxConsumption
        : Math.min(maxConsumption, Math.max(0, selectedConsumption));
      usedEnergy += normalizedConsumption;
    }

    return {
      used: this.roundNumber(usedEnergy, 2),
      available: this.roundNumber(availableEnergy, 2)
    };
  }

  private hasBuildingRequirements(requirements: BuildingRequirement[], levelWeAreUpgradingTo: number): boolean {
    for (const requirement of requirements) {
      const requiredLevel = Math.ceil(levelWeAreUpgradingTo * requirement.level);
      const currentLevel = this.buildingLevel(requirement.building);
      if (currentLevel < requiredLevel) {
        return false;
      }
    }

    return true;
  }

  private hasTechRequirements(requirements: TechRequirement[], levelWeAreUpgradingTo: number): boolean {
    for (const requirement of requirements) {
      const requiredLevel = Math.ceil(levelWeAreUpgradingTo * requirement.level);
      const currentLevel = this.techLevel(requirement.tech);
      if (currentLevel < requiredLevel) {
        return false;
      }
    }

    return true;
  }

  private techLevel(techType: TechnologyType): number {
    return this.techLevelsByType.get(techType) ?? 0;
  }

  private shipAmount(shipType: ShipType): number | null {
    const stored = this.shipAmountInputs.get(shipType);
    const raw = (stored ?? '').trim();
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100000) {
      return null;
    }

    return parsed;
  }

  private defenceAmount(defenceType: DefenceType): number | null {
    const stored = this.defenceAmountInputs.get(defenceType);
    const raw = (stored ?? '').trim();
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100000) {
      return null;
    }

    return parsed;
  }

  private multiplyCost(baseCost: ResourcesPack, amount: number): ResourcesPack {
    return new ResourcesPack(
      baseCost.metal * amount,
      baseCost.crystal * amount,
      baseCost.deuterium * amount
    );
  }

  private hasEnoughResources(cost: ResourcesPack): boolean {
    if (!this.planet) {
      return false;
    }

    const current = this.planet.objects.resources;
    return (
      current.metal >= cost.metal
      && current.crystal >= cost.crystal
      && current.deuterium >= cost.deuterium
    );
  }

  private isBuildingQueued(buildingType: BuildingType): boolean {
    return this.buildingQueueTypes.has(buildingType);
  }

  private isBuildingUnderConstruction(buildingType: BuildingType): boolean {
    const firstQueueEntry = this.planet?.objects.buildingQueue?.[0];
    if (!firstQueueEntry) {
      return false;
    }

    return this.queueEntryBuildingType(firstQueueEntry) === buildingType;
  }

  private isBuildingQueueFull(): boolean {
    return this.currentBuildingQueueLength() >= this.maxBuildingQueueLength();
  }

  private isShipQueueFull(): boolean {
    return this.currentShipQueueLength() >= this.maxShipQueueLength();
  }

  private isHeadShipQueueType(shipType: ShipType): boolean {
    const firstQueueEntry = this.planet?.objects.shipyardQueue?.[0];
    if (!firstQueueEntry) {
      return false;
    }

    return this.queueEntryItemKind(firstQueueEntry) === 'ship' && this.queueEntryShipType(firstQueueEntry) === shipType;
  }

  private isHeadDefenceQueueType(defenceType: DefenceType): boolean {
    const firstQueueEntry = this.planet?.objects.shipyardQueue?.[0];
    if (!firstQueueEntry) {
      return false;
    }

    return this.queueEntryItemKind(firstQueueEntry) === 'defence'
      && this.queueEntryDefenceType(firstQueueEntry) === defenceType;
  }

  private queueEntryBuildingType(entry: BuildingQueueEntryDto): BuildingType {
    if ((entry as { buildingType?: unknown }).buildingType) {
      return (entry as { buildingType: BuildingType }).buildingType;
    }

    return (entry as unknown as { type: BuildingType }).type;
  }

  private queueEntryNextLevel(entry: BuildingQueueEntryDto): number {
    const nextLevel = Number((entry as { nextLevel?: unknown }).nextLevel);
    if (Number.isInteger(nextLevel) && nextLevel >= 1) {
      return nextLevel;
    }

    const fallback = Number((entry as unknown as { level?: unknown }).level);
    if (Number.isInteger(fallback) && fallback >= 1) {
      return fallback;
    }

    return 1;
  }

  private queueEntryInvestedIndustryPower(entry: BuildingQueueEntryDto): number {
    const invested = Number((entry as { investedIndustryPower?: unknown }).investedIndustryPower);
    if (!Number.isFinite(invested) || invested < 0) {
      return 0;
    }

    return Math.floor(invested);
  }

  private queueEntryShipType(entry: ShipyardQueueEntryDto): ShipType {
    if ((entry as { shipType?: unknown }).shipType) {
      return (entry as { shipType: ShipType }).shipType;
    }

    return (entry as unknown as { type: ShipType }).type;
  }

  private queueEntryItemKind(entry: ShipyardQueueEntryDto): 'ship' | 'defence' {
    return entry.itemKind === 'defence' ? 'defence' : 'ship';
  }

  private queueEntryDefenceType(entry: ShipyardQueueEntryDto): DefenceType {
    if ((entry as { defenceType?: unknown }).defenceType) {
      return (entry as { defenceType: DefenceType }).defenceType;
    }

    return (entry as unknown as { type: DefenceType }).type;
  }

  private queueEntryShipAmount(entry: ShipyardQueueEntryDto): number {
    const amount = Number((entry as { amount?: unknown }).amount);
    if (Number.isInteger(amount) && amount >= 1) {
      return amount;
    }

    return 1;
  }

  private queueEntryInvestedShipyardPower(entry: ShipyardQueueEntryDto): number {
    const invested = Number((entry as { investedShipyardPower?: unknown }).investedShipyardPower);
    if (!Number.isFinite(invested) || invested < 0) {
      return 0;
    }

    return Math.floor(invested);
  }

  private queueEntryBaseConstructionTime(entry: ShipyardQueueEntryDto): number {
    const amount = this.queueEntryShipAmount(entry);
    if (this.queueEntryItemKind(entry) === 'defence') {
      return this.baseDefenceConstructionTime(this.queueEntryDefenceType(entry), amount);
    }

    return this.baseShipConstructionTime(this.queueEntryShipType(entry), amount);
  }

  private queueEntryTechnologyType(entry: TechnologyQueueEntryDto): TechnologyType {
    return entry.technologyType as TechnologyType;
  }

  private queueEntryResearchNextLevel(entry: TechnologyQueueEntryDto): number {
    const parsed = Number(entry.nextLevel);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }

    return Math.max(1, Math.floor(parsed));
  }

  private queueEntryInvestedResearchPower(entry: TechnologyQueueEntryDto): number {
    const parsed = Number(entry.investedResearchPower);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  private queueEntryHelperLabs(entry: TechnologyQueueEntryDto): ClientCoordinates[] {
    if (!Array.isArray(entry.helperLabs)) {
      return [];
    }

    const uniqueIds = new Set<string>();
    const result: ClientCoordinates[] = [];
    for (const helper of entry.helperLabs) {
      if (!helper || !Number.isInteger(helper.x) || !Number.isInteger(helper.y) || !Number.isInteger(helper.z)) {
        continue;
      }

      if (helper.x < 0 || helper.y < 0 || helper.z < 0) {
        continue;
      }

      const id = this.coordinatesToLabel(helper);
      if (uniqueIds.has(id)) {
        continue;
      }

      uniqueIds.add(id);
      result.push({
        x: helper.x,
        y: helper.y,
        z: helper.z
      });
    }

    return result;
  }

  private baseConstructionTime(buildingType: BuildingType, toLevel: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint || toLevel < 1) {
      return 0;
    }

    const cost = blueprint.getCostForLevel(toLevel);
    return Math.max(0, Math.floor(cost.getTotalResourceAmount()));
  }

  private baseShipConstructionTime(shipType: ShipType, amount: number): number {
    const blueprint = this.shipBlueprintsByType.get(shipType);
    if (!blueprint || amount < 1) {
      return 0;
    }

    const singleCostTotal = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
    return Math.max(0, singleCostTotal * amount);
  }

  private baseDefenceConstructionTime(defenceType: DefenceType, amount: number): number {
    const blueprint = this.defenceBlueprintsByType.get(defenceType);
    if (!blueprint || amount < 1) {
      return 0;
    }

    const singleCostTotal = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
    return Math.max(0, singleCostTotal * amount);
  }

  private baseResearchTime(technologyType: TechnologyType, toLevel: number): number {
    const technology = this.technologiesByType.get(technologyType);
    if (!technology || toLevel < 1) {
      return 0;
    }

    const total = technology.getCostForLevel(toLevel).getTotalResourceAmount();
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }

    return Math.floor(total);
  }

  private shipAmountCompleted(shipType: ShipType, amount: number, investedShipyardPower: number): number {
    const blueprint = this.shipBlueprintsByType.get(shipType);
    if (!blueprint || amount <= 0) {
      return 0;
    }

    const singleCostTotal = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
    if (singleCostTotal <= 0) {
      return amount;
    }

    const completed = Math.floor(investedShipyardPower / singleCostTotal);
    return Math.max(0, Math.min(amount, completed));
  }

  private defenceAmountCompleted(defenceType: DefenceType, amount: number, investedShipyardPower: number): number {
    const blueprint = this.defenceBlueprintsByType.get(defenceType);
    if (!blueprint || amount <= 0) {
      return 0;
    }

    const singleCostTotal = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
    if (singleCostTotal <= 0) {
      return amount;
    }

    const completed = Math.floor(investedShipyardPower / singleCostTotal);
    return Math.max(0, Math.min(amount, completed));
  }

  private currentShipInvestedPower(
    amountCompleted: number,
    amountTotal: number,
    investedShipyardPower: number,
    singleShipBaseConstructionTime: number
  ): number {
    if (singleShipBaseConstructionTime <= 0) {
      return 0;
    }

    if (amountCompleted >= amountTotal) {
      return singleShipBaseConstructionTime;
    }

    const remainder = investedShipyardPower % singleShipBaseConstructionTime;
    return Math.max(0, Math.min(singleShipBaseConstructionTime, remainder));
  }

  private currentIndustryPower(): number {
    const roboticsFactoryLevel = this.buildingLevel(BuildingType.ROBOTICS_FACTORY);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.planet?.info.planetaryParameters.industryModifier ?? 1;

    const roboticsPower = roboticsFactoryLevel <= 0
      ? 5
      : this.getProductionAtLevelByType(BuildingType.ROBOTICS_FACTORY, roboticsFactoryLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.getProductionAtLevelByTypeExact(BuildingType.NANITE_FACTORY, naniteFactoryLevel);

    const industryPower = roboticsPower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    if (!Number.isFinite(industryPower) || industryPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(industryPower * this.currentEnergyEfficiency()));
  }

  private currentShipyardPower(): number {
    const shipyardLevel = this.buildingLevel(BuildingType.SHIPYARD);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.planet?.info.planetaryParameters.industryModifier ?? 1;

    const shipyardBasePower = shipyardLevel <= 0
      ? 0
      : this.getProductionAtLevelByType(BuildingType.SHIPYARD, shipyardLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.getProductionAtLevelByTypeExact(BuildingType.NANITE_FACTORY, naniteFactoryLevel);

    const shipyardPower = shipyardBasePower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    if (!Number.isFinite(shipyardPower) || shipyardPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(shipyardPower * this.currentEnergyEfficiency()));
  }

  private currentResearchPower(): number {
    const researchLabLevel = this.buildingLevel(BuildingType.RESEARCH_LAB);
    const computerTechnologyLevel = this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const intergalacticResearchNetworkLevel = this.techLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK);
    const scienceModifier = this.planet?.info.planetaryParameters.scienceModifier ?? 1;
    const researchLabProduction = this.getProductionAtLevelByType(BuildingType.RESEARCH_LAB, researchLabLevel);
    const totalResearchMultiplier = researchPowerMultiplier(
      computerTechnologyLevel,
      adaptiveTechnologyLevel,
      intergalacticResearchNetworkLevel
    );

    const researchPower = researchLabProduction * totalResearchMultiplier * scienceModifier;
    if (!Number.isFinite(researchPower) || researchPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(researchPower * this.currentEnergyEfficiency()));
  }

  private currentShipRepairCapability(): number {
    const planet = this.planet;
    if (!planet) {
      return 0;
    }

    let total = calculateRepairCapabilityForManyShips(planet.objects.ships, {
      shipyardPower: this.currentShipyardPower()
    }).shipRepair;
    for (const fleet of this.currentPlanetIdleRepairFleets()) {
      total += calculateRepairCapabilityForManyShips(fleet.ships).shipRepair;
    }

    return total;
  }

  private currentIndustryRepairCapability(): number {
    return this.currentIndustryPower();
  }

  private currentDroneRepairCapability(): number {
    const planet = this.planet;
    if (!planet) {
      return 0;
    }

    let total = calculateRepairCapabilityForManyShips(planet.objects.ships).droneRepair;
    for (const fleet of this.currentPlanetIdleRepairFleets()) {
      total += calculateRepairCapabilityForManyShips(fleet.ships).droneRepair;
    }

    return total;
  }

  private shipyardPowerForPlanet(planet: ClientPlanetDto): number {
    const shipyardLevel = this.buildingLevelForPlanet(planet, BuildingType.SHIPYARD);
    const naniteFactoryLevel = this.buildingLevelForPlanet(planet, BuildingType.NANITE_FACTORY);
    const adaptiveTechnologyLevel = this.techLevelForPlanet(planet, TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = planet.info.planetaryParameters.industryModifier;
    const energyState = this.calculateEnergyStateForPlanet(planet);
    const energyEfficiency = energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);

    const shipyardBasePower = shipyardLevel <= 0
      ? 0
      : this.productionAtPlanetBuildingLevel(planet, BuildingType.SHIPYARD);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.productionAtPlanetBuildingLevelExact(planet, BuildingType.NANITE_FACTORY);

    const shipyardPower = shipyardBasePower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    if (!Number.isFinite(shipyardPower) || shipyardPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(shipyardPower * energyEfficiency));
  }

  private currentEnergyEfficiency(): number {
    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);
    return energyDeficitEfficiencyMultiplier(energy.available, energy.used);
  }

  private relativeOwnedPlanet(step: number): ClientPlanetDto | null {
    const currentPlanet = this.planet;
    if (!currentPlanet || this.ownedPlanets.length === 0) {
      return null;
    }

    const currentIndex = this.ownedPlanets.findIndex((planet) => this.sameCoordinates(planet.coordinates, currentPlanet.coordinates));
    if (currentIndex < 0) {
      return null;
    }

    const targetIndex = (currentIndex + step + this.ownedPlanets.length) % this.ownedPlanets.length;
    return this.ownedPlanets[targetIndex] ?? null;
  }

  private attentionLabelsForPlanet(planet: ClientPlanetDto): string[] {
    const labels: string[] = [];
    const energy = this.calculateEnergyStateForPlanet(planet);

    if (energy.used > energy.available) {
      labels.push('Energy insufficient');
    }

    if (this.hasAnyPlanetManualPowerReduction(planet)) {
      labels.push('Energy reduction');
    }

    if (planet.objects.buildingQueue.length === 0) {
      labels.push('Empty building queue');
    }

    if (planet.objects.shipyardQueue.length === 0) {
      labels.push('Empty shipyard queue');
    }

    if (!planet.objects.currentResearchQueue && !planet.objects.researchHelperFor) {
      labels.push('No active research role');
    }

    if (
      this.isPlanetPowerLimited(planet, BuildingType.ROBOTICS_FACTORY)
      || this.isPlanetPowerLimited(planet, BuildingType.NANITE_FACTORY)
    ) {
      labels.push('Reduced industry power');
    }

    if (
      this.isPlanetPowerLimited(planet, BuildingType.SHIPYARD)
      || this.isPlanetPowerLimited(planet, BuildingType.NANITE_FACTORY)
    ) {
      labels.push('Reduced shipyard power');
    }

    if (this.isPlanetPowerLimited(planet, BuildingType.RESEARCH_LAB)) {
      labels.push('Reduced research power');
    }

    if (this.hasDamagedShipsAtPlanet(planet)) {
      labels.push('Damaged ships present');
    }

    if (
      this.hasDamagedShipsAtPlanet(planet)
      && this.shipRepairCapabilityForPlanet(planet) + this.droneRepairCapabilityForPlanet(planet) <= 0
    ) {
      labels.push('Damaged ships without repair capability');
    }

    if (this.hasDamagedBuildingsAtPlanet(planet)) {
      labels.push('Damaged buildings present');
    }

    if (
      this.hasDamagedBuildingsAtPlanet(planet)
      && this.industryRepairCapabilityForPlanet(planet) + this.droneRepairCapabilityForPlanet(planet) <= 0
    ) {
      labels.push('Damaged buildings without repair capability');
    }

    if (this.hasDamagedDefencesAtPlanet(planet)) {
      labels.push('Damaged defences present');
    }

    if (
      this.hasDamagedDefencesAtPlanet(planet)
      && this.industryRepairCapabilityForPlanet(planet) + this.droneRepairCapabilityForPlanet(planet) <= 0
    ) {
      labels.push('Damaged defences without repair capability');
    }

    return labels;
  }

  private headerIndicatorToneForPlanet(planet: ClientPlanetDto): 'safe' | 'neutral' | 'danger' {
    const labels = this.attentionLabelsForPlanet(planet);
    return this.headerIndicatorToneFromLabels(labels);
  }

  private currentPlanetAttentionLabels(): string[] {
    const planet = this.planet;
    if (!planet) {
      return [];
    }

    const labels: string[] = [];
    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);

    if (energy.used > energy.available) {
      labels.push('Energy insufficient');
    }

    if (this.hasAnyCurrentPlanetManualPowerReduction()) {
      labels.push('Energy reduction');
    }

    if (planet.objects.buildingQueue.length === 0) {
      labels.push('Empty building queue');
    }

    if (planet.objects.shipyardQueue.length === 0) {
      labels.push('Empty shipyard queue');
    }

    if (!planet.objects.currentResearchQueue && !planet.objects.researchHelperFor) {
      labels.push('No active research role');
    }

    if (
      this.isBuildingNotUsingFullPower(BuildingType.ROBOTICS_FACTORY)
      || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY)
    ) {
      labels.push('Reduced industry power');
    }

    if (
      this.isBuildingNotUsingFullPower(BuildingType.SHIPYARD)
      || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY)
    ) {
      labels.push('Reduced shipyard power');
    }

    if (this.isBuildingNotUsingFullPower(BuildingType.RESEARCH_LAB)) {
      labels.push('Reduced research power');
    }

    if (this.hasDamagedShipsAtCurrentPlanet()) {
      labels.push('Damaged ships present');
    }

    if (
      this.hasDamagedShipsAtCurrentPlanet()
      && this.currentShipRepairCapability() + this.currentDroneRepairCapability() <= 0
    ) {
      labels.push('Damaged ships without repair capability');
    }

    if (this.hasDamagedBuildingsAtCurrentPlanet()) {
      labels.push('Damaged buildings present');
    }

    if (
      this.hasDamagedBuildingsAtCurrentPlanet()
      && this.currentIndustryRepairCapability() + this.currentDroneRepairCapability() <= 0
    ) {
      labels.push('Damaged buildings without repair capability');
    }

    if (this.hasDamagedDefencesAtCurrentPlanet()) {
      labels.push('Damaged defences present');
    }

    if (
      this.hasDamagedDefencesAtCurrentPlanet()
      && this.currentIndustryRepairCapability() + this.currentDroneRepairCapability() <= 0
    ) {
      labels.push('Damaged defences without repair capability');
    }

    return labels;
  }

  private hasDamagedShipsAtCurrentPlanet(): boolean {
    const planet = this.planet;
    if (!planet) {
      return false;
    }

    if (ManyShips.hasDamagedShips(planet.objects.ships)) {
      return true;
    }

    return this.currentPlanetIdleRepairFleets().some((fleet) => ManyShips.hasDamagedShips(fleet.ships));
  }

  private hasDamagedShipsAtPlanet(planet: ClientPlanetDto): boolean {
    if (ManyShips.hasDamagedShips(planet.objects.ships)) {
      return true;
    }

    return this.idleRepairFleetsForPlanet(planet).some((fleet) => ManyShips.hasDamagedShips(fleet.ships));
  }

  private hasDamagedBuildingsAtCurrentPlanet(): boolean {
    const planet = this.planet;
    if (!planet) {
      return false;
    }

    return [...this.buildingLevelsByType.entries()].some(([type, level]) =>
      level > 0 && this.currentBuildingStructuralPoints(type) < this.maxBuildingStructuralPoints(type, level)
    );
  }

  private hasDamagedBuildingsAtPlanet(planet: ClientPlanetDto): boolean {
    return planet.objects.buildingsLevels.some((entry) => {
      const buildingType = entry.type as BuildingType;
      const max = this.maxBuildingStructuralPoints(buildingType, entry.level);
      return entry.level > 0 && this.currentPlanetBuildingStructuralPoints(planet, buildingType, max) < max;
    });
  }

  private hasDamagedDefencesAtCurrentPlanet(): boolean {
    const planet = this.planet;
    if (!planet) {
      return false;
    }

    return ManyDefences.hasDamagedDefences(planet.objects.defences);
  }

  private hasDamagedDefencesAtPlanet(planet: ClientPlanetDto): boolean {
    return ManyDefences.hasDamagedDefences(planet.objects.defences);
  }

  private shipRepairCapabilityForPlanet(planet: ClientPlanetDto): number {
    let total = calculateRepairCapabilityForManyShips(planet.objects.ships, {
      shipyardPower: this.shipyardPowerForPlanet(planet)
    }).shipRepair;
    for (const fleet of this.idleRepairFleetsForPlanet(planet)) {
      total += calculateRepairCapabilityForManyShips(fleet.ships).shipRepair;
    }

    return total;
  }

  private droneRepairCapabilityForPlanet(planet: ClientPlanetDto): number {
    let total = calculateRepairCapabilityForManyShips(planet.objects.ships).droneRepair;
    for (const fleet of this.idleRepairFleetsForPlanet(planet)) {
      total += calculateRepairCapabilityForManyShips(fleet.ships).droneRepair;
    }

    return total;
  }

  private industryRepairCapabilityForPlanet(planet: ClientPlanetDto): number {
    const roboticsFactoryLevel = this.buildingLevelForPlanet(planet, BuildingType.ROBOTICS_FACTORY);
    const naniteFactoryLevel = this.buildingLevelForPlanet(planet, BuildingType.NANITE_FACTORY);
    const adaptiveTechnologyLevel = this.techLevelForPlanet(planet, TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = planet.info.planetaryParameters.industryModifier;
    const energyState = this.calculateEnergyStateForPlanet(planet);
    const energyEfficiency = energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);

    const roboticsPower = roboticsFactoryLevel <= 0
      ? 5
      : this.productionAtPlanetBuildingLevel(planet, BuildingType.ROBOTICS_FACTORY);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.productionAtPlanetBuildingLevelExact(planet, BuildingType.NANITE_FACTORY);
    const industryPower = roboticsPower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    if (!Number.isFinite(industryPower) || industryPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(industryPower * energyEfficiency));
  }

  private currentPlanetIdleRepairFleets(): Fleet[] {
    const planet = this.planet;
    if (!planet) {
      return [];
    }

    return this.idleRepairFleetsForPlanet(planet);
  }

  private idleRepairFleetsForPlanet(planet: ClientPlanetDto): Fleet[] {
    return this.activeFleets.filter((fleet) => {
      if (fleet.state !== FleetState.ORBITING) {
        return false;
      }

      const coordinates = fleet.target;
      return this.sameCoordinates(coordinates, planet.coordinates);
    });
  }

  private headerIndicatorToneFromLabels(labels: string[]): 'safe' | 'neutral' | 'danger' {
    if (labels.includes('Energy insufficient')) {
      return 'danger';
    }

    return labels.length > 0 ? 'neutral' : 'safe';
  }

  private calculateEnergyStateForPlanet(planet: ClientPlanetDto): EnergyState {
    const energyTechLevel = this.techLevelForPlanet(planet, TechnologyType.ENERGY_TECHNOLOGY);
    const solarProduction = this.productionAtPlanetBuildingLevel(planet, BuildingType.SOLAR_WIND_GEOTHERMAL);
    const nuclearProduction = this.productionAtPlanetBuildingLevel(planet, BuildingType.NUCLEAR_PLANT);
    const fusionProduction = this.productionAtPlanetBuildingLevel(planet, BuildingType.FUSION_REACTOR);
    const parameters = planet.info.planetaryParameters;

    const availableEnergy = (
      (solarProduction * parameters.energyModifierRES)
      + (nuclearProduction * parameters.energyModifierNuclear)
      + fusionProduction
    ) * (1 + ((energyTechLevel * 2) / 100));

    let usedEnergy = 0;
    for (const entry of planet.objects.buildingsLevels) {
      const buildingType = entry.type as BuildingType;
      if (entry.level <= 0) {
        continue;
      }

      const blueprint = this.buildingBlueprintsByType.get(buildingType);
      if (!blueprint) {
        continue;
      }

      const maxConsumption = Math.max(0, entry.level * (blueprint.powerConsumption ?? 0));
      const currentConsumption = this.currentPlanetBuildingPowerConsumption(planet, buildingType);
      usedEnergy += currentConsumption === null
        ? maxConsumption
        : Math.min(maxConsumption, Math.max(0, currentConsumption));
    }

    return {
      used: this.roundNumber(usedEnergy, 2),
      available: this.roundNumber(availableEnergy, 2)
    };
  }

  private isPlanetPowerLimited(planet: ClientPlanetDto, buildingType: BuildingType): boolean {
    const maxConsumption = this.maxPlanetBuildingPowerConsumption(planet, buildingType);
    if (maxConsumption <= 0) {
      return false;
    }

    const currentConsumption = this.currentPlanetBuildingPowerConsumption(planet, buildingType);
    return currentConsumption !== null && currentConsumption + 0.0001 < maxConsumption;
  }

  private hasAnyPlanetManualPowerReduction(planet: ClientPlanetDto): boolean {
    for (const entry of planet.objects.buildingsLevels) {
      const buildingType = entry.type as BuildingType;
      if (this.isPlanetPowerLimited(planet, buildingType)) {
        return true;
      }
    }

    return false;
  }

  private maxPlanetBuildingPowerConsumption(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const level = this.buildingLevelForPlanet(planet, buildingType);
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    return this.roundNumber(level * (blueprint?.powerConsumption ?? 0), 2);
  }

  private currentPlanetBuildingPowerConsumption(planet: ClientPlanetDto, buildingType: BuildingType): number | null {
    const entry = planet.objects.buildingsCurrentPowerConsumption.find((item) => item.type === buildingType);
    return entry ? this.roundNumber(entry.currentPowerConsumption, 2) : null;
  }

  private buildingLevelForPlanet(planet: ClientPlanetDto, buildingType: BuildingType): number {
    return planet.objects.buildingsLevels.find((entry) => entry.type === buildingType)?.level ?? 0;
  }

  private productionAtPlanetBuildingLevel(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    const level = this.buildingLevelForPlanet(planet, buildingType);
    return this.getProductionAtLevel(
      blueprint,
      level,
      this.currentPlanetBuildingPowerConsumption(planet, buildingType),
      this.structuralUtilizationForPlanet(planet, buildingType)
    );
  }

  private productionAtPlanetBuildingLevelExact(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    const level = this.buildingLevelForPlanet(planet, buildingType);
    return this.getProductionAtLevelExact(
      blueprint,
      level,
      this.currentPlanetBuildingPowerConsumption(planet, buildingType),
      this.structuralUtilizationForPlanet(planet, buildingType)
    );
  }

  private techLevelForPlanet(planet: ClientPlanetDto, technologyType: TechnologyType): number {
    return planet.reportData?.techLevels.find((entry) => entry.type === technologyType)?.level ?? 0;
  }

  private sortOwnedPlanets(planets: ClientPlanetDto[]): ClientPlanetDto[] {
    return [...planets].sort((left, right) =>
      left.basicInfo.name.localeCompare(right.basicInfo.name)
      || left.coordinates.y - right.coordinates.y
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.z - right.coordinates.z
    );
  }

  private syncOwnedPlanet(updatedPlanet: ClientPlanetDto): void {
    const existingIndex = this.ownedPlanets.findIndex((planet) => this.sameCoordinates(planet.coordinates, updatedPlanet.coordinates));
    if (existingIndex < 0) {
      return;
    }

    this.ownedPlanets[existingIndex] = updatedPlanet;
    this.ownedPlanets = this.sortOwnedPlanets(this.ownedPlanets);
  }

  private coordinatesLabelForPlanet(planet: ClientPlanetDto): string {
    return `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}`;
  }

  private sameCoordinates(
    left: ClientPlanetDto['coordinates'],
    right: ClientPlanetDto['coordinates']
  ): boolean {
    return left.x === right.x
      && left.y === right.y
      && left.z === right.z;
  }

  private energyPenaltyTooltip(availableEnergy: number, usedEnergy: number): string {
    const penaltyPercent = this.roundNumber(energyDeficitPenaltyPercent(availableEnergy, usedEnergy), 2);
    return `Current energy penalty: ${penaltyPercent}%.`;
  }

  private isBuildingNotUsingFullPower(buildingType: BuildingType): boolean {
    const maxConsumption = this.maxBuildingPowerConsumption(buildingType);
    if (maxConsumption <= 0) {
      return false;
    }

    const currentConsumption = this.buildingCurrentPowerByType.get(buildingType) ?? maxConsumption;
    return currentConsumption < maxConsumption;
  }

  private hasAnyCurrentPlanetManualPowerReduction(): boolean {
    for (const buildingType of this.buildingLevelsByType.keys()) {
      if (this.isBuildingNotUsingFullPower(buildingType)) {
        return true;
      }
    }

    return false;
  }

  private getProductionAtLevelByType(buildingType: BuildingType, level: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    return this.getProductionAtLevel(blueprint, level);
  }

  private getProductionAtLevelByTypeExact(buildingType: BuildingType, level: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    return this.getProductionAtLevelExact(blueprint, level);
  }

  private getProductionAtLevel(
    building: Building,
    level: number,
    explicitPowerConsumption?: number | null,
    explicitStructuralUtilization?: number | null
  ): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    const utilization = this.powerUtilizationAtLevel(
      building.type,
      level,
      building.powerConsumption ?? 0,
      explicitPowerConsumption
    );
    const structuralUtilization = explicitStructuralUtilization ?? this.structuralUtilizationAtLevel(building.type, level);
    return Math.floor(baseProduction * utilization * structuralUtilization);
  }

  private getProductionAtLevelExact(
    building: Building,
    level: number,
    explicitPowerConsumption?: number | null,
    explicitStructuralUtilization?: number | null
  ): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    const utilization = this.powerUtilizationAtLevel(
      building.type,
      level,
      building.powerConsumption ?? 0,
      explicitPowerConsumption
    );
    const structuralUtilization = explicitStructuralUtilization ?? this.structuralUtilizationAtLevel(building.type, level);
    return baseProduction * utilization * structuralUtilization;
  }

  private getRawProductionAtLevel(building: Building, level: number): number {
    if (level <= 0) {
      return 0;
    }

    const index = level - 1;
    const value = building.production1[index];
    if (!Number.isFinite(value)) {
      return 0;
    }

    return value;
  }

  private powerUtilizationAtLevel(
    buildingType: BuildingType,
    level: number,
    powerPerLevel: number,
    explicitPowerConsumption?: number | null
  ): number {
    if (level <= 0) {
      return 0;
    }

    if (powerPerLevel <= 0) {
      return 1;
    }

    const maxConsumption = Math.max(0, level * powerPerLevel);
    if (maxConsumption <= 0) {
      return 1;
    }

    const selectedConsumption = explicitPowerConsumption ?? this.buildingCurrentPowerByType.get(buildingType);
    const normalizedConsumption = selectedConsumption === undefined
      ? maxConsumption
      : Math.min(maxConsumption, Math.max(0, selectedConsumption));
    return normalizedConsumption / maxConsumption;
  }

  private currentBuildingStructuralPoints(buildingType: BuildingType): number {
    const level = this.buildingLevel(buildingType);
    const max = this.maxBuildingStructuralPoints(buildingType, level);
    if (max <= 0) {
      return 0;
    }

    const current = this.buildingCurrentStructuralPointsByType.get(buildingType);
    return current === undefined ? max : Math.min(max, Math.max(0, current));
  }

  private structuralUtilizationAtLevel(buildingType: BuildingType, level: number): number {
    if (level <= 0) {
      return 0;
    }

    if (buildingType === BuildingType.TERRAFORMER) {
      return 1;
    }

    const max = this.maxBuildingStructuralPoints(buildingType, level);
    if (max <= 0) {
      return 1;
    }

    const ratio = this.currentBuildingStructuralPoints(buildingType) / max;
    return Math.min(1, Math.max(this.minimumStructuralUtilization(buildingType), ratio));
  }

  private structuralUtilizationForPlanet(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const level = this.buildingLevelForPlanet(planet, buildingType);
    if (level <= 0) {
      return 0;
    }

    if (buildingType === BuildingType.TERRAFORMER) {
      return 1;
    }

    const max = this.maxBuildingStructuralPoints(buildingType, level);
    if (max <= 0) {
      return 1;
    }

    const current = this.currentPlanetBuildingStructuralPoints(planet, buildingType, max);
    return Math.min(1, Math.max(this.minimumStructuralUtilizationForPlanet(planet, buildingType), current / max));
  }

  private currentPlanetBuildingStructuralPoints(
    planet: ClientPlanetDto,
    buildingType: BuildingType,
    fallbackMax?: number
  ): number {
    const max = fallbackMax ?? this.maxBuildingStructuralPoints(buildingType, this.buildingLevelForPlanet(planet, buildingType));
    if (max <= 0) {
      return 0;
    }

    const entry = planet.objects.buildingsCurrentStructuralPoints.find((item) => item.type === buildingType);
    return entry ? Math.min(max, Math.max(0, Math.floor(entry.currentStructuralPoints))) : max;
  }

  private maxBuildingStructuralPoints(buildingType: BuildingType, level: number): number {
    if (level <= 0) {
      return 0;
    }

    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    const cost = blueprint.getCostForLevel(level);
    return Math.max(0, Math.floor((cost.metal * 2) + cost.crystal + Math.floor(cost.deuterium * 0.5)));
  }

  private minimumStructuralUtilization(buildingType: BuildingType): number {
    if (this.isZeroFloorBuilding(buildingType)) {
      return 0;
    }

    return Math.min(1, 0.02 + (this.buildingLevel(BuildingType.BUNKER_NETWORK) * 0.01));
  }

  private minimumStructuralUtilizationForPlanet(planet: ClientPlanetDto, buildingType: BuildingType): number {
    if (this.isZeroFloorBuilding(buildingType)) {
      return 0;
    }

    return Math.min(1, 0.02 + (this.buildingLevelForPlanet(planet, BuildingType.BUNKER_NETWORK) * 0.01));
  }

  private isZeroFloorBuilding(buildingType: BuildingType): boolean {
    return buildingType === BuildingType.JUMP_GATE
      || buildingType === BuildingType.SENSOR_PHALANX
      || buildingType === BuildingType.BOMB_DEPOT;
  }

  private wouldExceedBombDepotCapacity(defenceType: DefenceType, requestedAmount: number): boolean {
    if (!isPlanetaryBombDefenceType(defenceType)) {
      return false;
    }

    return this.currentPlanetaryBombCount() + this.queuedPlanetaryBombCount() + requestedAmount > this.bombDepotCapacity();
  }

  private buildingNextLevel(building: Building): number {
    return this.buildingLevel(building.type) + 1;
  }

  private buildingNextLevelCost(building: Building): ResourcesPack {
    const currentLevel = this.buildingLevel(building.type);
    const multiplier = 2 ** currentLevel;
    return new ResourcesPack(
      building.basicCost.metal * multiplier,
      building.basicCost.crystal * multiplier,
      building.basicCost.deuterium * multiplier
    );
  }

  private initializeBuildingCurrentPowerConsumption(): void {
    const defaults = this.createDefaultPowerConsumptionMap(this.buildingLevelsByType);
    for (const [buildingType, maxConsumption] of defaults.entries()) {
      const currentConsumption = this.buildingCurrentPowerByType.get(buildingType);
      const normalizedConsumption = currentConsumption === undefined
        ? maxConsumption
        : Math.min(maxConsumption, Math.max(0, currentConsumption));
      this.setBuildingCurrentPowerConsumption(buildingType, normalizedConsumption);
    }
  }

  private createProjectedPowerConsumptionMap(levels: Map<BuildingType, number>): Map<BuildingType, number> {
    const projected = this.createDefaultPowerConsumptionMap(levels);
    for (const [buildingType, currentConsumption] of this.buildingCurrentPowerByType.entries()) {
      const maxConsumption = this.maxBuildingPowerConsumptionAtLevels(buildingType, levels);
      if (maxConsumption <= 0) {
        continue;
      }

      projected.set(
        buildingType,
        this.roundNumber(Math.min(maxConsumption, Math.max(0, currentConsumption)), 2)
      );
    }

    return projected;
  }

  private createDefaultPowerConsumptionMap(levels: Map<BuildingType, number>): Map<BuildingType, number> {
    const defaults = new Map<BuildingType, number>();
    for (const [buildingType, level] of levels.entries()) {
      const blueprint = this.buildingBlueprintsByType.get(buildingType);
      if (!blueprint) {
        continue;
      }

      const maxConsumption = Math.max(0, level * (blueprint.powerConsumption ?? 0));
      defaults.set(buildingType, this.roundNumber(maxConsumption, 2));
    }

    return defaults;
  }

  private maxBuildingPowerConsumption(buildingType: BuildingType): number {
    return this.maxBuildingPowerConsumptionAtLevels(buildingType, this.buildingLevelsByType);
  }

  private maxBuildingPowerConsumptionAtLevels(
    buildingType: BuildingType,
    levels: Map<BuildingType, number>
  ): number {
    const level = levels.get(buildingType) ?? 0;
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    return this.roundNumber(Math.max(0, level * (blueprint.powerConsumption ?? 0)), 2);
  }

  private setBuildingCurrentPowerConsumption(buildingType: BuildingType, powerConsumption: number): void {
    const maxConsumption = this.maxBuildingPowerConsumption(buildingType);
    if (maxConsumption <= 0) {
      this.buildingCurrentPowerByType.delete(buildingType);
      return;
    }

    const normalizedPower = this.roundNumber(
      Math.min(maxConsumption, Math.max(0, powerConsumption)),
      2
    );
    this.buildingCurrentPowerByType.set(buildingType, normalizedPower);
  }

  private parseNonNegativeInt(value: string | null): number | null {
    if (value === null) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private coordinatesToLabel(coordinates: ClientCoordinates): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }

  private startQueueTabAutoRefresh(): void {
    if (this.queueTabRefreshTimer !== null) {
      return;
    }

    this.refreshQueueTabPlanetState();
    this.queueTabRefreshTimer = setInterval(() => {
      this.refreshQueueTabPlanetState();
    }, 3000);
  }

  private stopQueueTabAutoRefresh(): void {
    if (this.queueTabRefreshTimer !== null) {
      clearInterval(this.queueTabRefreshTimer);
      this.queueTabRefreshTimer = null;
    }

    this.queueTabRefreshInFlight = false;
  }

  private refreshQueueTabPlanetState(): void {
    if (this.activeTab !== 'queues') {
      return;
    }

    if (
      this.queueTabRefreshInFlight
      || this.isLoading
      || this.buildingQueueMutationInFlight
      || this.shipyardQueueMutationInFlight
    ) {
      return;
    }

    const planet = this.planet;
    const session = this.playerSession.load();
    if (!planet || !session) {
      return;
    }

    const expectedX = planet.coordinates.x;
    const expectedY = planet.coordinates.y;
    const expectedZ = planet.coordinates.z;

    this.queueTabRefreshInFlight = true;
    this.gameApi.getClientPlanet(expectedX, expectedY, expectedZ, session.token, { ownedOnly: true })
      .pipe(
        timeout(8000),
        finalize(() => {
          this.queueTabRefreshInFlight = false;
        })
      )
      .subscribe({
        next: (updatedPlanet) => {
          if (
            !this.planet
            || this.planet.coordinates.x !== expectedX
            || this.planet.coordinates.y !== expectedY
            || this.planet.coordinates.z !== expectedZ
          ) {
            return;
          }

          this.planet = updatedPlanet;
          this.syncOwnedPlanet(updatedPlanet);
          this.rebuildPlanetState();
          this.cdr.markForCheck();
        },
        error: () => {
          // Keep polling silent for queue auto-refresh.
        }
      });
  }

  private roundNumber(value: number, precision: number): number {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
  }

  private armLoadingSafetyTimeout(requestKey: number): void {
    this.clearLoadingSafetyTimeout();
    this.loadingSafetyTimer = setTimeout(() => {
      if (this.currentPlanetRequestKey !== requestKey || !this.isLoading) {
        return;
      }

      this.pendingPlanetRequests = 0;
      this.isLoading = false;
      this.planet = null;
      this.loadError = 'Unable to load planet from server.';
      this.cdr.markForCheck();
    }, 12000);
  }

  private clearLoadingSafetyTimeout(): void {
    if (this.loadingSafetyTimer !== null) {
      clearTimeout(this.loadingSafetyTimer);
      this.loadingSafetyTimer = null;
    }
  }

  private updateAttentionHighlight(shouldHighlight: boolean): void {
    this.clearAttentionHighlightTimeout();
    this.isAttentionHighlightActive = shouldHighlight;

    if (!shouldHighlight) {
      return;
    }

    this.attentionHighlightTimer = setTimeout(() => {
      this.isAttentionHighlightActive = false;
      this.cdr.markForCheck();
    }, 4500);
  }

  private clearAttentionHighlightTimeout(): void {
    if (this.attentionHighlightTimer !== null) {
      clearTimeout(this.attentionHighlightTimer);
      this.attentionHighlightTimer = null;
    }
  }
}
