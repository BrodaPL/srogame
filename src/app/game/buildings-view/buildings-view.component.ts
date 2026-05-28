import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { resolveApiErrorMessage } from '../../i18n/api-message.utils';
import { I18nService } from '../../i18n/i18n.service';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import type {
  CancelBuildingQueueEntryRequest,
  ClientPlanetDto,
  ReorderBuildingQueueRequest,
  StartBuildingConstructionRequest
} from '../../models/game-api-types';
import { energyDeficitEfficiencyMultiplier, energyDeficitPenaltyPercent } from '../../models/planets/energy-deficit';
import { resolveFusionReactorOperation, type FusionReactorOperation } from '../../models/planets/fusion-reactor-operation';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { industryPowerMultiplier, researchPowerMultiplier } from '../../models/tech/technology-effects';
import {
  calculateRepairDroneProductionBasePower,
  routeRepairDroneProduction
} from '../../models/turns/repair-drone-production';
import { TutorialService } from '../../tutorial/tutorial.service';
import { toRawImagePath } from '../../encyclopedia-menu/encyclopedia-image-paths';
import { ManyShips } from '../../models/fleets/many-ships';
import {
  PlanetObjectDetailDialogData,
  PlanetObjectDetailRow,
  PlanetObjectDetailSection,
  PlanetObjectDialogComponent
} from '../planet-view/planet-object-dialog.component';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import {
  PlanetPowersDisplay,
  ResourceDisplay,
  ResourcesComponent,
  ResourceTitleLink
} from '../ui/resources/resources.component';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

type BuildingsMode = 'r' | 'f';

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

@Component({
  selector: 'app-buildings-view',
  imports: [
    TopMenuComponent,
    ResourcesComponent,
    MiniPlanetPreviewComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    PlanetObjectDialogComponent,
    TooltipDirective
  ],
  templateUrl: './buildings-view.component.html',
  styleUrl: './buildings-view.component.css'
})
export class BuildingsViewComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  protected readonly modeOptions: Array<{ value: BuildingsMode; label: string }> = [
    { value: 'r', label: 'Resources infrastructure' },
    { value: 'f', label: 'Facilities' }
  ];

  protected isLoading = false;
  protected loadError: string | null = null;
  protected selectedMode: BuildingsMode = 'r';
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected selectedPlanetId: string | null = null;
  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected energyTooltip: string | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;
  protected buildingQueueActionError: string | null = null;
  protected buildingQueueMutationInFlight = false;
  protected selectedObjectDetails: PlanetObjectDetailDialogData | null = null;

  private readonly resourceBuildings: Building[];
  private readonly facilityBuildings: Building[];
  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly buildingCurrentPowerByType = new Map<BuildingType, number>();
  private readonly buildingCurrentStructuralPointsByType = new Map<BuildingType, number>();
  private readonly buildingQueueTypes = new Set<BuildingType>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly buildingStartInFlightByType = new Set<BuildingType>();
  private readonly buildingStartErrorByType = new Map<BuildingType, string>();

  constructor(
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
  }

  public ngOnInit(): void {
    this.selectedMode = location.search === '?m=f' ? 'f' : 'r';
    this.loadOwnedPlanets();
  }

  protected selectedPlanet(): ClientPlanetDto | null {
    if (!this.selectedPlanetId) {
      return null;
    }

    return this.ownedPlanets.find((planet) => this.planetId(planet) === this.selectedPlanetId) ?? null;
  }

  protected visibleBuildings(): Building[] {
    return this.selectedMode === 'r' ? this.resourceBuildings : this.facilityBuildings;
  }

  protected setMode(mode: BuildingsMode): void {
    this.selectedMode = mode;
    history.replaceState(history.state, '', location.pathname + (mode === 'f' ? '?m=f' : ''));
  }

  protected trackPlanet(_index: number, planet: ClientPlanetDto): string {
    return this.planetId(planet);
  }

  protected trackQueueRow(_index: number, row: BuildingQueueRowVm): string {
    return `${row.position}:${row.buildingType}:${row.toLevel}`;
  }

  protected selectedPlanetLabel(): string {
    const planet = this.selectedPlanet();
    if (!planet) {
      return 'No planet selected';
    }

    return `${planet.basicInfo.name} (${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z})`;
  }

  protected selectedPlanetName(): string {
    return this.selectedPlanet()?.basicInfo.name ?? 'No planet selected';
  }

  protected selectedPlanetCoordinatesLabel(): string {
    const planet = this.selectedPlanet();
    return planet ? `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}` : '--:--:--';
  }

  protected selectedPlanetTitleLink(): ResourceTitleLink | null {
    const planet = this.selectedPlanet();
    if (!planet) {
      return null;
    }

    return {
      label: planet.basicInfo.name,
      routerLink: '/game/planet',
      queryParams: {
        x: planet.coordinates.x,
        y: planet.coordinates.y,
        z: planet.coordinates.z
      },
      title: `Open ${planet.basicInfo.name} in Planet View`
    };
  }

  protected selectPlanet(planet: ClientPlanetDto): void {
    this.selectedPlanetId = this.planetId(planet);
    this.rebuildSelectedPlanetState();
  }

  protected isSelectedPlanet(planet: ClientPlanetDto): boolean {
    return this.planetId(planet) === this.selectedPlanetId;
  }

  protected buildingLevel(buildingType: BuildingType): number {
    return this.buildingLevelsByType.get(buildingType) ?? 0;
  }

  protected openBuildingDetails(building: Building): void {
    this.selectedObjectDetails = this.createBuildingDetailDialogData(building);
  }

  protected closeObjectDetails(): void {
    this.selectedObjectDetails = null;
  }

  protected buildingCostRows(building: Building): BuildingCostRowVm[] {
    const currentResources = this.selectedPlanet()?.objects.resources;
    const cost = this.buildingNextLevelCost(building);

    return [
      {
        label: 'M',
        amount: cost.metal,
        isEnough: (currentResources?.metal ?? 0) >= cost.metal
      },
      {
        label: 'C',
        amount: cost.crystal,
        isEnough: (currentResources?.crystal ?? 0) >= cost.crystal
      },
      {
        label: 'D',
        amount: cost.deuterium,
        isEnough: (currentResources?.deuterium ?? 0) >= cost.deuterium
      }
    ];
  }

  protected resourceCostIconPath(label: string): string {
    switch (label) {
      case 'M':
      case 'Metal':
        return 'images/icons/small/metal.png';
      case 'C':
      case 'Crystal':
        return 'images/icons/small/crystal.png';
      case 'D':
      case 'Deuterium':
        return 'images/icons/small/deuter.png';
      default:
        return '';
    }
  }

  protected unmetRequirementRows(building: Building): BuildingRequirementRowVm[] {
    return this.buildingRequirementRows(building).filter((row) => !row.isMet);
  }

  protected unmetRequirementsLabel(building: Building): string | null {
    const unmetRows = this.unmetRequirementRows(building);
    if (unmetRows.length === 0) {
      return null;
    }

    const totalRows = this.buildingRequirementRows(building).length;
    return `Requirements ${unmetRows.length}/${totalRows}`;
  }

  protected unmetRequirementsTooltip(building: Building): string | null {
    const unmetRows = this.unmetRequirementRows(building);
    if (unmetRows.length === 0) {
      return null;
    }

    return unmetRows.map((row) => row.label).join('\n');
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
    const planet = this.selectedPlanet();
    if (!planet || planet.info.ownerId === null) {
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

    const planet = this.selectedPlanet();
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
          this.ownedPlanets = this.ownedPlanets.map((entry) =>
            this.planetId(entry) === this.planetId(updatedPlanet) ? updatedPlanet : entry
          );
          this.selectedPlanetId = this.planetId(updatedPlanet);
          this.rebuildSelectedPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.buildingStartErrorByType.set(
            building.type,
            resolveApiErrorMessage(this.i18n, error, 'Unable to add building to queue.')
          );
          this.cdr.markForCheck();
        }
      });
  }

  protected buildingStartError(building: Building): string | null {
    return this.buildingStartErrorByType.get(building.type) ?? null;
  }

  protected hasBuildingQueueEntries(): boolean {
    return (this.selectedPlanet()?.objects.buildingQueue?.length ?? 0) > 0;
  }

  protected currentBuildingQueueLength(): number {
    return this.selectedPlanet()?.objects.buildingQueue?.length ?? 0;
  }

  protected maxBuildingQueueLength(): number {
    const computerTechLevel = this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const roboticsFactoryLevel = this.buildingLevel(BuildingType.ROBOTICS_FACTORY);
    const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechLevel + roboticsFactoryLevel));
    return Math.max(1, Math.floor(rawLimit));
  }

  protected buildingQueueRows(): BuildingQueueRowVm[] {
    const queueEntries = this.selectedPlanet()?.objects.buildingQueue ?? [];
    const industryPower = this.currentTotalIndustryPower();
    let cumulativeRemaining = 0;

    return queueEntries.map((entry, index) => {
      const buildingType = entry.buildingType;
      const toLevel = entry.nextLevel;
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

  protected buildingQueueDropListId(): string {
    return `buildings-queue:${this.selectedPlanetId ?? 'none'}`;
  }

  protected isBuildingQueueInteractionDisabled(): boolean {
    return this.buildingQueueMutationInFlight;
  }

  protected buildingQueueCancelTitle(row: BuildingQueueRowVm): string {
    if (row.investedIndustryPower <= 0) {
      return 'Cancel and refund 100% of this queued building.';
    }

    return 'Cancel and refund 75% of this started building.';
  }

  protected onBuildingQueueDrop(event: CdkDragDrop<BuildingQueueRowVm[]>): void {
    if (event.previousIndex === event.currentIndex || this.buildingQueueMutationInFlight) {
      return;
    }

    const rows = this.buildingQueueRows();
    const movedRow = rows[event.previousIndex];
    const targetRow = rows[event.currentIndex];
    const planet = this.selectedPlanet();
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
          this.applyUpdatedPlanet(updatedPlanet);
        },
        error: (error: { error?: { error?: string } }) => {
          this.buildingQueueActionError = resolveApiErrorMessage(this.i18n, error, 'Unable to reorder building queue.');
          this.cdr.markForCheck();
        }
      });
  }

  protected onCancelBuildingQueue(row: BuildingQueueRowVm): void {
    if (this.buildingQueueMutationInFlight) {
      return;
    }

    const planet = this.selectedPlanet();
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
          this.applyUpdatedPlanet(updatedPlanet);
        },
        error: (error: { error?: { error?: string } }) => {
          this.buildingQueueActionError = resolveApiErrorMessage(this.i18n, error, 'Unable to cancel building queue entry.');
          this.cdr.markForCheck();
        }
      });
  }

  private loadOwnedPlanets(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;

    this.gameApi.getOwnedPlanets(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (ownedPlanets) => {
          this.ownedPlanets = [...ownedPlanets];
          this.selectedPlanetId = ownedPlanets[0] ? this.planetId(ownedPlanets[0]) : null;
          this.rebuildSelectedPlanetState();
          this.tutorialService.autoOpenTutorial('buildingsView');
        },
        error: () => {
          this.loadError = 'Unable to load owned planets.';
        }
      });
  }

  private rebuildSelectedPlanetState(): void {
    this.buildingLevelsByType.clear();
    this.buildingCurrentPowerByType.clear();
    this.buildingCurrentStructuralPointsByType.clear();
    this.buildingQueueTypes.clear();
    this.techLevelsByType.clear();
    this.buildingStartInFlightByType.clear();
    this.buildingStartErrorByType.clear();
    this.buildingQueueActionError = null;
    this.buildingQueueMutationInFlight = false;
    this.selectedObjectDetails = null;

    const planet = this.selectedPlanet();
    if (!planet) {
      this.metalDisplay = null;
      this.crystalDisplay = null;
      this.deuteriumDisplay = null;
      this.energyDisplay = null;
      this.energyTooltip = null;
      this.powersDisplay = null;
      return;
    }

    for (const entry of planet.objects.buildingsLevels) {
      this.buildingLevelsByType.set(entry.type as BuildingType, entry.level);
    }

    for (const entry of planet.objects.buildingsCurrentPowerConsumption ?? []) {
      this.buildingCurrentPowerByType.set(
        entry.type as BuildingType,
        this.roundNumber(Math.max(0, entry.currentPowerConsumption), 2)
      );
    }

    for (const entry of planet.objects.buildingsCurrentStructuralPoints ?? []) {
      this.buildingCurrentStructuralPointsByType.set(
        entry.type as BuildingType,
        Math.max(0, Math.floor(entry.currentStructuralPoints))
      );
    }

    for (const queuedEntry of planet.objects.buildingQueue) {
      this.buildingQueueTypes.add(queuedEntry.buildingType);
    }

    for (const techEntry of planet.reportData?.techLevels ?? []) {
      this.techLevelsByType.set(techEntry.type as TechnologyType, techEntry.level);
    }

    this.initializeBuildingCurrentPowerConsumption();
    this.updateResourceDisplays();
  }

  private updateResourceDisplays(): void {
    const planet = this.selectedPlanet();
    if (!planet) {
      this.metalDisplay = null;
      this.crystalDisplay = null;
      this.deuteriumDisplay = null;
      this.energyDisplay = null;
      this.energyTooltip = null;
      this.powersDisplay = null;
      return;
    }

    const adaptiveTechLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const resources = planet.objects.resources;
    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);
    const fusionOperation = this.currentFusionReactorOperation();
    const energyEfficiency = energyDeficitEfficiencyMultiplier(energy.available, energy.used);

    const metalCapacity = this.storageCapacity(BuildingType.METAL_STORAGE);
    const crystalCapacity = this.storageCapacity(BuildingType.CRYSTAL_STORAGE);
    const deuteriumCapacity = this.storageCapacity(BuildingType.DEUTERIUM_TANK);

    this.metalDisplay = {
      current: resources.metal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.METAL_MINE, adaptiveTechLevel, planet.info.planetaryParameters.metalModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.metal, metalCapacity)
    };
    this.crystalDisplay = {
      current: resources.crystal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.CRYSTAL_MINE, adaptiveTechLevel, planet.info.planetaryParameters.crystalModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.crystal, crystalCapacity)
    };
    this.deuteriumDisplay = {
      current: resources.deuterium,
      productionPerTurn: this.roundNumber(fusionOperation.netDeuteriumIncome, 2),
      capacityPercent: this.capacityPercent(resources.deuterium, deuteriumCapacity)
    };

    this.energyDisplay = {
      used: energy.used,
      available: energy.available
    };
    this.energyTooltip = this.energyPenaltyTooltip(energy.available, energy.used);
    this.powersDisplay = {
      industryPower: this.currentIndustryPower(),
      droneIndustryPower: this.currentDroneIndustryPower(),
      totalIndustryPower: this.currentTotalIndustryPower(),
      shipyardPower: this.currentBaseShipyardPower(),
      droneShipyardPower: this.currentDroneShipyardPower(),
      totalShipyardPower: this.currentTotalShipyardPower(),
      researchPower: this.currentResearchPower(),
      industryPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.ROBOTICS_FACTORY)
        || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY)
        || (energyEfficiency < 0.9999 && (
          this.buildingLevel(BuildingType.ROBOTICS_FACTORY) > 0
          || this.buildingLevel(BuildingType.NANITE_FACTORY) > 0
        )),
      shipyardPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.SHIPYARD)
        || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY)
        || (energyEfficiency < 0.9999 && (
          this.buildingLevel(BuildingType.SHIPYARD) > 0
          || this.buildingLevel(BuildingType.NANITE_FACTORY) > 0
        )),
      researchPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.RESEARCH_LAB)
        || (energyEfficiency < 0.9999 && this.buildingLevel(BuildingType.RESEARCH_LAB) > 0)
    };
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
    const fusionProduction = this.resolveFusionReactorOperationForCurrentState(levels, currentPowerByType).powerOutput;

    const parameters = this.selectedPlanet()?.info.planetaryParameters;
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

  private currentIndustryPower(): number {
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const roboticsFactoryLevel = this.buildingLevel(BuildingType.ROBOTICS_FACTORY);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);

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
    return !Number.isFinite(industryPower) || industryPower <= 0 ? 0 : Math.floor(industryPower * this.currentEnergyEfficiency());
  }

  private currentDroneIndustryPower(): number {
    return this.currentDroneProductionRouting().droneIndustryPower;
  }

  private currentDroneShipyardPower(): number {
    return this.currentDroneProductionRouting().droneShipyardPower;
  }

  private currentTotalIndustryPower(): number {
    return this.currentIndustryPower() + this.currentDroneIndustryPower();
  }

  private currentTotalShipyardPower(): number {
    return this.currentBaseShipyardPower() + this.currentDroneShipyardPower();
  }

  private currentFusionReactorSelectedStage(): number {
    const level = this.buildingLevel(BuildingType.FUSION_REACTOR);
    if (level <= 0) {
      return 0;
    }

    const stored = this.selectedPlanet()?.objects.fusionReactorStage?.selectedStage;
    if (stored === null || stored === undefined || !Number.isFinite(stored)) {
      return level;
    }

    return Math.min(level, Math.max(0, Math.floor(stored)));
  }

  private currentFusionReactorOperation(): FusionReactorOperation {
    return this.resolveFusionReactorOperationForCurrentState(
      this.buildingLevelsByType,
      this.buildingCurrentPowerByType
    );
  }

  private resolveFusionReactorOperationForCurrentState(
    levels: Map<BuildingType, number>,
    currentPowerByType: Map<BuildingType, number>
  ): FusionReactorOperation {
    const fusionLevel = levels.get(BuildingType.FUSION_REACTOR) ?? 0;

    let otherEnergyUsed = 0;
    for (const [buildingType, level] of levels.entries()) {
      if (buildingType === BuildingType.FUSION_REACTOR || level <= 0) {
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
      otherEnergyUsed += normalizedConsumption;
    }

    return resolveFusionReactorOperation({
      selectedStage: this.currentFusionReactorSelectedStage(),
      maxStage: fusionLevel,
      structuralUtilization: this.structuralUtilizationAtLevel(BuildingType.FUSION_REACTOR, fusionLevel),
      energyTechnologyLevel: this.techLevel(TechnologyType.ENERGY_TECHNOLOGY),
      adaptiveTechnologyLevel: this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY),
      solarProduction: this.getProductionAtLevelByType(
        BuildingType.SOLAR_WIND_GEOTHERMAL,
        levels.get(BuildingType.SOLAR_WIND_GEOTHERMAL) ?? 0
      ),
      nuclearProduction: this.getProductionAtLevelByType(
        BuildingType.NUCLEAR_PLANT,
        levels.get(BuildingType.NUCLEAR_PLANT) ?? 0
      ),
      otherEnergyUsed,
      energyModifierRES: this.selectedPlanet()?.info.planetaryParameters.energyModifierRES ?? 1,
      energyModifierNuclear: this.selectedPlanet()?.info.planetaryParameters.energyModifierNuclear ?? 1,
      deuteriumSynthesizerProduction: this.getProductionAtLevelByType(
        BuildingType.DEUTERIUM_SYNTHESIZER,
        levels.get(BuildingType.DEUTERIUM_SYNTHESIZER) ?? 0
      ),
      deuteriumModifier: this.selectedPlanet()?.info.planetaryParameters.deuteriumModifier ?? 1,
      fusionPowerAtStage: (stage) => this.getRawBuildingProductionAtStage(BuildingType.FUSION_REACTOR, stage, 'production1'),
      fusionDeuteriumAtStage: (stage) => this.getRawBuildingProductionAtStage(BuildingType.FUSION_REACTOR, stage, 'production2')
    });
  }

  private currentBaseShipyardPower(): number {
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const shipyardLevel = this.buildingLevel(BuildingType.SHIPYARD);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);

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
    return !Number.isFinite(shipyardPower) || shipyardPower <= 0 ? 0 : Math.floor(shipyardPower * this.currentEnergyEfficiency());
  }

  private currentDroneProductionRouting(): ReturnType<typeof routeRepairDroneProduction> {
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const repairDroneCount = ManyShips.countByType(this.selectedPlanet()?.objects.ships).get(ShipType.REPAIR_DRONE) ?? 0;

    return routeRepairDroneProduction(
      calculateRepairDroneProductionBasePower({
        repairDroneCount,
        industryModifier,
        adaptiveIndustryMultiplier: industryPowerMultiplier(adaptiveTechnologyLevel),
        energyEfficiency: this.currentEnergyEfficiency()
      }),
      {
        hasBuildingQueueWork: (this.selectedPlanet()?.objects.buildingQueue?.length ?? 0) > 0,
        hasShipyardQueueWork: (this.selectedPlanet()?.objects.shipyardQueue?.length ?? 0) > 0
      }
    );
  }

  private currentResearchPower(): number {
    const scienceModifier = this.selectedPlanet()?.info.planetaryParameters.scienceModifier ?? 1;
    const researchLabLevel = this.buildingLevel(BuildingType.RESEARCH_LAB);
    const computerTechnologyLevel = this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const intergalacticResearchNetworkLevel = this.techLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK);
    const researchLabProduction = this.getProductionAtLevelByType(BuildingType.RESEARCH_LAB, researchLabLevel);
    const totalResearchMultiplier = researchPowerMultiplier(
      computerTechnologyLevel,
      adaptiveTechnologyLevel,
      intergalacticResearchNetworkLevel
    );

    const researchPower = researchLabProduction * totalResearchMultiplier * scienceModifier;
    return !Number.isFinite(researchPower) || researchPower <= 0 ? 0 : Math.floor(researchPower * this.currentEnergyEfficiency());
  }

  private currentEnergyEfficiency(): number {
    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);
    return energyDeficitEfficiencyMultiplier(energy.available, energy.used);
  }

  private energyPenaltyTooltip(availableEnergy: number, usedEnergy: number): string {
    const penaltyPercent = this.roundNumber(energyDeficitPenaltyPercent(availableEnergy, usedEnergy), 2);
    return `Current energy penalty: ${penaltyPercent}%.`;
  }

  private buildingRequirementRows(building: Building): BuildingRequirementRowVm[] {
    const targetLevel = this.buildingNextLevel(building);
    const rows: BuildingRequirementRowVm[] = [];

      for (const requirement of building.buildingRequirements) {
        const requiredLevel = Math.ceil(targetLevel * requirement.level);
        const currentLevel = this.buildingLevel(requirement.building);
        rows.push({
          label: `${requirement.building}: ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel
        });
      }

      for (const requirement of building.techRequirements) {
        const requiredLevel = Math.ceil(targetLevel * requirement.level);
        const currentLevel = this.techLevel(requirement.tech);
        rows.push({
          label: `${requirement.tech} (Tech): ${currentLevel}/${requiredLevel}`,
          isMet: currentLevel >= requiredLevel
        });
      }

    return rows;
  }

  private createBuildingDetailDialogData(building: Building): PlanetObjectDetailDialogData {
    const currentLevel = this.buildingLevel(building.type);
    const maxPower = this.maxBuildingPowerConsumption(building.type);
    const currentPower = this.buildingCurrentPowerByType.get(building.type) ?? maxPower;
    const fusionOperation = building.type === BuildingType.FUSION_REACTOR
      ? this.currentFusionReactorOperation()
      : null;
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
        value: String(currentLevel > 0 ? this.currentBuildingDetailProduction(building) : this.detailProductionAtLevel(building, 1))
      });
    }

    if (fusionOperation) {
      summaryRows.push(
        {
          label: 'Selected stage',
          value: String(fusionOperation.selectedStage)
        },
        {
          label: 'Deuterium upkeep',
          value: String(fusionOperation.deuteriumUpkeep)
        }
      );
    } else if (building.powerConsumption > 0) {
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
        value: `L${currentLevel + 1}`
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
          value: String(this.currentBuildingDetailProduction(building))
        });
      }

      stateRows.push(
        {
          label: 'Structural points',
          value: `${this.currentBuildingStructuralPoints(building.type)} / ${this.maxBuildingStructuralPoints(building.type, currentLevel)}`
        },
        {
          label: 'Structural efficiency',
          value: `${this.buildingStructuralUtilizationPercent(building.type)}%`
        }
      );

      if (fusionOperation) {
        stateRows.push(
          {
            label: 'Effective stage',
            value: String(fusionOperation.effectiveStage),
            tone: fusionOperation.isClamped ? 'warn' : 'default'
          },
          {
            label: 'Gross deuterium income',
            value: String(fusionOperation.grossDeuteriumIncome)
          },
          {
            label: 'Net deuterium income',
            value: String(fusionOperation.netDeuteriumIncome)
          }
        );
      } else if (maxPower > 0) {
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

    return {
      kindLabel: 'Building',
      title: building.type,
      subtitle: `${this.selectedPlanet()?.basicInfo.name ?? 'Buildings View'} | Building`,
      description: building.description,
      previewImagePath: building.imagePath,
      rawImagePath: toRawImagePath(building.imagePath),
      sections: sections.filter((section) => section.rows.length > 0)
    };
  }

  private createDetailSection(title: string, rows: PlanetObjectDetailRow[]): PlanetObjectDetailSection {
    return {
      title,
      rows
    };
  }

  private buildingCostHeader(building: Building): string {
    return this.buildingLevel(building.type) <= 0
      ? 'Initial cost'
      : `Next level cost (L${this.buildingLevel(building.type) + 1})`;
  }

  private detailRowsFromCostRows(rows: BuildingCostRowVm[]): PlanetObjectDetailRow[] {
    return rows.map((row) => ({
      label: row.label === 'M' ? 'Metal' : row.label === 'C' ? 'Crystal' : row.label === 'D' ? 'Deuterium' : row.label,
      value: String(row.amount),
      tone: row.isEnough ? 'default' : 'bad'
    }));
  }

  private detailRowsFromRequirementRows(rows: BuildingRequirementRowVm[]): PlanetObjectDetailRow[] {
    if (rows.length === 0) {
      return [
        {
          label: 'Requirement',
          value: 'None',
          tone: 'muted'
        }
      ];
    }

      return rows.map((row) => {
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

  private hasEnoughResources(cost: ResourcesPack): boolean {
    const resources = this.selectedPlanet()?.objects.resources;
    if (!resources) {
      return false;
    }

    return (
      resources.metal >= cost.metal
      && resources.crystal >= cost.crystal
      && resources.deuterium >= cost.deuterium
    );
  }

  private isBuildingQueued(buildingType: BuildingType): boolean {
    return this.buildingQueueTypes.has(buildingType);
  }

  private isBuildingUnderConstruction(buildingType: BuildingType): boolean {
    const firstQueueEntry = this.selectedPlanet()?.objects.buildingQueue?.[0];
    return !!firstQueueEntry && firstQueueEntry.buildingType === buildingType;
  }

  private isBuildingQueueFull(): boolean {
    return this.currentBuildingQueueLength() >= this.maxBuildingQueueLength();
  }

  private storageCapacity(buildingType: BuildingType): number {
    return this.getProductionAtLevelByType(buildingType, this.buildingLevel(buildingType));
  }

  private resourceGain(
    buildingType: BuildingType,
    adaptiveTechLevel: number,
    planetaryModifier: number
  ): number {
    return this.currentBuildingProduction(buildingType)
      * (1 + adaptiveTechLevel / 100)
      * planetaryModifier;
  }

  private currentBuildingProduction(buildingType: BuildingType): number {
    return this.getProductionAtLevelByType(buildingType, this.buildingLevel(buildingType));
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

  private getProductionAtLevelExact(building: Building, level: number): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    const utilization = this.powerUtilizationAtLevel(
      building.type,
      level,
      building.powerConsumption ?? 0
    );
    return baseProduction * utilization;
  }

  private detailProductionAtLevel(building: Building, level: number): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    const utilization = this.powerUtilizationAtLevel(
      building.type,
      level,
      building.powerConsumption ?? 0
    );
    const structuralUtilization = this.structuralUtilizationAtLevel(building.type, level);
    return Math.floor(baseProduction * utilization * structuralUtilization);
  }

  private currentBuildingDetailProduction(building: Building): number {
    if (building.type === BuildingType.FUSION_REACTOR) {
      return this.currentFusionReactorOperation().powerOutput;
    }

    return this.detailProductionAtLevel(building, this.buildingLevel(building.type));
  }

  private getRawProductionAtLevel(building: Building, level: number): number {
    if (level <= 0) {
      return 0;
    }

    const value = building.production1[level - 1];
    return Number.isFinite(value) ? value : 0;
  }

  private getRawBuildingProductionAtStage(
    buildingType: BuildingType,
    stage: number,
    key: 'production1' | 'production2'
  ): number {
    if (stage <= 0) {
      return 0;
    }

    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    const value = blueprint[key][stage - 1];
    return Number.isFinite(value) ? value : 0;
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

  private currentBuildingStructuralPoints(buildingType: BuildingType): number {
    const level = this.buildingLevel(buildingType);
    const max = this.maxBuildingStructuralPoints(buildingType, level);
    if (max <= 0) {
      return 0;
    }

    const current = this.buildingCurrentStructuralPointsByType.get(buildingType);
    return current === undefined ? max : Math.min(max, Math.max(0, current));
  }

  private buildingStructuralUtilizationPercent(buildingType: BuildingType): number {
    return Math.round(this.structuralUtilizationAtLevel(buildingType, this.buildingLevel(buildingType)) * 100);
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

  private isZeroFloorBuilding(buildingType: BuildingType): boolean {
    return buildingType === BuildingType.JUMP_GATE
      || buildingType === BuildingType.SENSOR_PHALANX
      || buildingType === BuildingType.BOMB_DEPOT;
  }

  private isBuildingNotUsingFullPower(buildingType: BuildingType): boolean {
    const maxConsumption = this.maxBuildingPowerConsumption(buildingType);
    if (maxConsumption <= 0) {
      return false;
    }

    const currentConsumption = this.buildingCurrentPowerByType.get(buildingType) ?? maxConsumption;
    return currentConsumption < maxConsumption;
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
    const level = this.buildingLevel(buildingType);
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

  private queueEntryInvestedIndustryPower(entry: { investedIndustryPower?: unknown }): number {
    const invested = Number(entry.investedIndustryPower);
    return !Number.isFinite(invested) || invested < 0 ? 0 : Math.floor(invested);
  }

  private baseConstructionTime(buildingType: BuildingType, toLevel: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint || toLevel < 1) {
      return 0;
    }

    const cost = blueprint.getCostForLevel(toLevel);
    return Math.max(0, Math.floor(cost.getTotalResourceAmount()));
  }

  private capacityPercent(current: number, capacity: number): number | null {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      return null;
    }

    return Math.round((current / capacity) * 100);
  }

  private planetId(planet: ClientPlanetDto): string {
    return `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}`;
  }

  private applyUpdatedPlanet(updatedPlanet: ClientPlanetDto): void {
    this.ownedPlanets = this.ownedPlanets.map((entry) =>
      this.planetId(entry) === this.planetId(updatedPlanet) ? updatedPlanet : entry
    );
    this.selectedPlanetId = this.planetId(updatedPlanet);
    this.rebuildSelectedPlanetState();
    this.cdr.markForCheck();
  }

  private roundNumber(value: number, precision: number): number {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
  }

}
