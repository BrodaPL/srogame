import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { TechnologyBlueprintsFactory } from '../../factories/technology-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import type {
  BuildingQueueEntryDto,
  ClientCoordinates,
  ClientPlanetDto,
  SetBuildingPowerConsumptionRequest,
  ShipyardQueueEntryDto,
  StartBuildingConstructionRequest,
  StartShipyardConstructionRequest,
  TechnologyQueueEntryDto
} from '../../models/game-api-types';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { Ship } from '../../models/fleets/ship';
import { Technology } from '../../models/tech/technology';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { PlanetPowersDisplay, ResourceDisplay, ResourcesComponent } from '../ui/resources/resources.component';

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
  position: number;
  buildingType: BuildingType;
  fromLevel: number;
  toLevel: number;
  investedIndustryPower: number;
  baseTotalConstructionTime: number;
  estimatedTurnsForCompletion: number | null;
  isHeadOfQueue: boolean;
};

type ShipQueueRowVm = {
  position: number;
  shipType: ShipType;
  amountCompleted: number;
  amountTotal: number;
  currentShipInvestedShipyardPower: number;
  currentShipBaseConstructionTime: number;
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
  imports: [TopMenuComponent, ResourcesComponent, FormsModule],
  templateUrl: './planet-view.component.html'
})
export class PlanetViewComponent implements OnInit, OnDestroy {
  protected planet: ClientPlanetDto | null = null;
  protected isLoading = false;
  protected loadError: string | null = null;
  protected activeTab: PlanetTab = 'resources';
  protected coordinatesLabel = '--:--:--';

  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;

  protected readonly resourceBuildings: Building[];
  protected readonly facilityBuildings: Building[];
  protected readonly shipBlueprints: Ship[];

  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly shipBlueprintsByType: Map<ShipType, Ship>;
  private readonly technologiesByType: Map<TechnologyType, Technology>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly buildingCurrentPowerByType = new Map<BuildingType, number>();
  private readonly powerUpdateInFlightByType = new Set<BuildingType>();
  private readonly powerUpdateErrorByType = new Map<BuildingType, string>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly buildingQueueTypes = new Set<BuildingType>();
  private readonly buildingStartInFlightByType = new Set<BuildingType>();
  private readonly buildingStartErrorByType = new Map<BuildingType, string>();
  private readonly shipStartInFlightByType = new Set<ShipType>();
  private readonly shipStartErrorByType = new Map<ShipType, string>();
  private readonly shipAmountInputs = new Map<ShipType, string>();
  private currentPlanetRequestKey = 0;
  private pendingPlanetRequests = 0;
  private loadingSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTabRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private queueTabRefreshInFlight = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    const allBuildings = Array.from(buildingBlueprints.buildingsMap.values());
    this.resourceBuildings = allBuildings.filter((building) => !building.isFacility);
    this.facilityBuildings = allBuildings.filter((building) => building.isFacility);
    this.buildingBlueprintsByType = new Map(buildingBlueprints.buildingsMap);

    const ships = ShipBlueprintsFactory.fromDefaultJson();
    this.shipBlueprints = Array.from(ships.shipsMap.values());
    this.shipBlueprintsByType = new Map(ships.shipsMap);

    const technologies = TechnologyBlueprintsFactory.fromDefaultJson();
    this.technologiesByType = new Map(technologies.techByType);
  }

  public ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const x = this.parseNonNegativeInt(params.get('x'));
      const y = this.parseNonNegativeInt(params.get('y'));
      const z = this.parseNonNegativeInt(params.get('z'));

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

  protected shipAmountInput(shipType: ShipType): string {
    return this.shipAmountInputs.get(shipType) ?? '';
  }

  protected onShipAmountInput(shipType: ShipType, rawValue: unknown): void {
    const normalized = typeof rawValue === 'number'
      ? String(rawValue)
      : typeof rawValue === 'string'
        ? rawValue
        : '';
    this.shipAmountInputs.set(shipType, normalized);
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

  protected shipRequirementRows(ship: Ship): BuildingRequirementRowVm[] {
    const rows: BuildingRequirementRowVm[] = [];

    for (const requirement of ship.buildingRequirements) {
      const requiredLevel = Math.ceil(requirement.level);
      const currentLevel = this.buildingLevel(requirement.building);
      rows.push({
        label: `B ${requirement.building}: ${currentLevel}/${requiredLevel}`,
        isMet: currentLevel >= requiredLevel,
        isPlaceholder: false
      });
    }

    for (const requirement of ship.techRequirements) {
      const requiredLevel = Math.ceil(requirement.level);
      const currentLevel = this.techLevel(requirement.tech);
      rows.push({
        label: `T ${requirement.tech}: ${currentLevel}/${requiredLevel}`,
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

  protected shipBuildLabel(ship: Ship): string {
    if (this.isHeadShipQueueType(ship.type)) {
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

  protected shipStartError(ship: Ship): string | null {
    return this.shipStartErrorByType.get(ship.type) ?? null;
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
    return `Queues (B ${this.currentBuildingQueueLength()}/${this.maxBuildingQueueLength()} | S ${this.currentShipQueueLength()}/${this.maxShipQueueLength()})`;
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
      const investedIndustryPower = this.queueEntryInvestedIndustryPower(entry);
      const baseTotalConstructionTime = this.baseConstructionTime(buildingType, toLevel);
      const remaining = Math.max(0, baseTotalConstructionTime - investedIndustryPower);
      cumulativeRemaining += remaining;
      const estimatedTurnsForCompletion = industryPower > 0
        ? Math.ceil(cumulativeRemaining / industryPower)
        : null;

      return {
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

  protected hasShipQueueEntries(): boolean {
    return (this.planet?.objects.shipyardQueue?.length ?? 0) > 0;
  }

  protected shipQueueRows(): ShipQueueRowVm[] {
    const queueEntries = this.planet?.objects.shipyardQueue ?? [];
    const shipyardPower = this.currentShipyardPower();
    let cumulativeRemaining = 0;

    return queueEntries.map((entry, index) => {
      const shipType = this.queueEntryShipType(entry);
      const amountTotal = this.queueEntryShipAmount(entry);
      const investedShipyardPower = this.queueEntryInvestedShipyardPower(entry);
      const baseTotalConstructionTime = this.baseShipConstructionTime(shipType, amountTotal);
      const singleShipBaseConstructionTime = this.baseShipConstructionTime(shipType, 1);
      const remaining = Math.max(0, baseTotalConstructionTime - investedShipyardPower);
      cumulativeRemaining += remaining;
      const estimatedTurnsForCompletion = shipyardPower > 0
        ? Math.ceil(cumulativeRemaining / shipyardPower)
        : null;
      const amountCompleted = this.shipAmountCompleted(shipType, amountTotal, investedShipyardPower);
      const currentShipInvestedShipyardPower = this.currentShipInvestedPower(
        amountCompleted,
        amountTotal,
        investedShipyardPower,
        singleShipBaseConstructionTime
      );

      return {
        position: index + 1,
        shipType,
        amountCompleted,
        amountTotal,
        currentShipInvestedShipyardPower,
        currentShipBaseConstructionTime: singleShipBaseConstructionTime,
        estimatedTurnsForCompletion,
        isHeadOfQueue: index === 0
      };
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
        label: `B ${requirement.building}: ${currentLevel}/${requiredLevel}`,
        isMet: currentLevel >= requiredLevel,
        isPlaceholder: false
      });
    }

    for (const requirement of building.techRequirements) {
      const requiredLevel = Math.ceil(targetLevel * requirement.level);
      const currentLevel = this.techLevel(requirement.tech);
      rows.push({
        label: `T ${requirement.tech}: ${currentLevel}/${requiredLevel}`,
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

  private loadPlanet(x: number, y: number, z: number): void {
    this.stopQueueTabAutoRefresh();
    this.currentPlanetRequestKey += 1;
    const requestKey = this.currentPlanetRequestKey;

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

    this.gameApi.getClientPlanet(x, y, z, session.token)
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
        next: (planet) => {
          if (this.currentPlanetRequestKey !== requestKey) {
            return;
          }

          try {
            if (planet.info.ownerId === null) {
              this.loadError = 'Planet view is available only for your own planets.';
              this.planet = null;
              this.cdr.markForCheck();
              return;
            }

            this.planet = planet;
            this.coordinatesLabel = `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}`;
            this.activeTab = 'resources';
            this.shipAmountInputs.clear();
            this.rebuildPlanetState();
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
    this.powerUpdateInFlightByType.clear();
    this.powerUpdateErrorByType.clear();
    this.buildingStartInFlightByType.clear();
    this.buildingStartErrorByType.clear();
    this.shipStartInFlightByType.clear();
    this.shipStartErrorByType.clear();
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

    for (const queued of this.planet.objects.buildingQueue) {
      this.buildingQueueTypes.add(this.queueEntryBuildingType(queued));
    }

    for (const entry of this.planet.reportData?.techLevels ?? []) {
      this.techLevelsByType.set(entry.type as TechnologyType, entry.level);
    }

    this.initializeBuildingCurrentPowerConsumption();
    this.updateResourceDisplays();
  }

  private updateResourceDisplays(): void {
    if (!this.planet) {
      this.metalDisplay = null;
      this.crystalDisplay = null;
      this.deuteriumDisplay = null;
      this.energyDisplay = null;
      this.powersDisplay = null;
      return;
    }

    const adaptiveTechLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const resources = this.planet.objects.resources;

    const metalCapacity = this.storageCapacity(BuildingType.METAL_STORAGE);
    const crystalCapacity = this.storageCapacity(BuildingType.CRYSTAL_STORAGE);
    const deuteriumCapacity = this.storageCapacity(BuildingType.DEUTERIUM_TANK);

    this.metalDisplay = {
      current: resources.metal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.METAL_MINE, adaptiveTechLevel, this.planet.info.planetaryParameters.metalModifier), 2),
      capacityPercent: this.capacityPercent(resources.metal, metalCapacity)
    };

    this.crystalDisplay = {
      current: resources.crystal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.CRYSTAL_MINE, adaptiveTechLevel, this.planet.info.planetaryParameters.crystalModifier), 2),
      capacityPercent: this.capacityPercent(resources.crystal, crystalCapacity)
    };

    this.deuteriumDisplay = {
      current: resources.deuterium,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.DEUTERIUM_SYNTHESIZER, adaptiveTechLevel, this.planet.info.planetaryParameters.deuteriumModifier), 2),
      capacityPercent: this.capacityPercent(resources.deuterium, deuteriumCapacity)
    };

    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);
    this.energyDisplay = {
      used: energy.used,
      available: energy.available
    };

    this.powersDisplay = {
      industryPower: this.currentIndustryPower(),
      shipyardPower: this.currentShipyardPower(),
      researchPower: this.currentResearchPower(),
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

    return this.queueEntryShipType(firstQueueEntry) === shipType;
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
    const industryModifier = this.planet?.info.planetaryParameters.industryModifier ?? 1;

    const roboticsPower = roboticsFactoryLevel <= 0
      ? 5
      : this.getProductionAtLevelByType(BuildingType.ROBOTICS_FACTORY, roboticsFactoryLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.getProductionAtLevelByType(BuildingType.NANITE_FACTORY, naniteFactoryLevel);

    const industryPower = roboticsPower * naniteMultiplier * industryModifier;
    if (!Number.isFinite(industryPower) || industryPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(industryPower));
  }

  private currentShipyardPower(): number {
    const shipyardLevel = this.buildingLevel(BuildingType.SHIPYARD);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);
    const industryModifier = this.planet?.info.planetaryParameters.industryModifier ?? 1;

    const shipyardBasePower = shipyardLevel <= 0
      ? 0
      : this.getProductionAtLevelByType(BuildingType.SHIPYARD, shipyardLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.getProductionAtLevelByType(BuildingType.NANITE_FACTORY, naniteFactoryLevel);

    const shipyardPower = shipyardBasePower * naniteMultiplier * industryModifier;
    if (!Number.isFinite(shipyardPower) || shipyardPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(shipyardPower));
  }

  private currentResearchPower(): number {
    const researchLabLevel = this.buildingLevel(BuildingType.RESEARCH_LAB);
    const computerTechnologyLevel = this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const scienceModifier = this.planet?.info.planetaryParameters.scienceModifier ?? 1;
    const researchLabProduction = this.getProductionAtLevelByType(BuildingType.RESEARCH_LAB, researchLabLevel);
    const computerMultiplier = 1 + ((computerTechnologyLevel * 5) / 100);

    const researchPower = researchLabProduction * computerMultiplier * scienceModifier;
    if (!Number.isFinite(researchPower) || researchPower <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(researchPower));
  }

  private isBuildingNotUsingFullPower(buildingType: BuildingType): boolean {
    const maxConsumption = this.maxBuildingPowerConsumption(buildingType);
    if (maxConsumption <= 0) {
      return false;
    }

    const currentConsumption = this.buildingCurrentPowerByType.get(buildingType) ?? maxConsumption;
    return currentConsumption < maxConsumption;
  }

  private getProductionAtLevelByType(buildingType: BuildingType, level: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    return this.getProductionAtLevel(blueprint, level);
  }

  private getProductionAtLevel(building: Building, level: number): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    const utilization = this.powerUtilizationAtLevel(
      building.type,
      level,
      building.powerConsumption ?? 0
    );
    return Math.floor(baseProduction * utilization);
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
    powerPerLevel: number
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

    const selectedConsumption = this.buildingCurrentPowerByType.get(buildingType);
    const normalizedConsumption = selectedConsumption === undefined
      ? maxConsumption
      : Math.min(maxConsumption, Math.max(0, selectedConsumption));
    return normalizedConsumption / maxConsumption;
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

    if (this.queueTabRefreshInFlight || this.isLoading) {
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
    this.gameApi.getClientPlanet(expectedX, expectedY, expectedZ, session.token)
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
}
