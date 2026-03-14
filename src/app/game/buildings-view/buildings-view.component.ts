import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { TechnologyType } from '../../models/enums/technology-type';
import type { ClientPlanetDto, StartBuildingConstructionRequest } from '../../models/game-api-types';
import { energyDeficitEfficiencyMultiplier, energyDeficitPenaltyPercent } from '../../models/planets/energy-deficit';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { industryPowerMultiplier, researchPowerMultiplier } from '../../models/tech/technology-effects';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import {
  PlanetPowersDisplay,
  ResourceDisplay,
  ResourcesComponent,
  ResourceTitleLink
} from '../ui/resources/resources.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

type BuildingsMode = 'resources' | 'facilities';

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
    MiniPlanetPreviewComponent
  ],
  templateUrl: './buildings-view.component.html',
  styleUrl: './buildings-view.component.css'
})
export class BuildingsViewComponent implements OnInit {
  protected readonly modeOptions: Array<{ value: BuildingsMode; label: string }> = [
    { value: 'resources', label: 'Resources infrastructure' },
    { value: 'facilities', label: 'Facilities' }
  ];

  protected isLoading = false;
  protected loadError: string | null = null;
  protected selectedMode: BuildingsMode = 'resources';
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected selectedPlanetId: string | null = null;
  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected energyTooltip: string | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;

  private readonly resourceBuildings: Building[];
  private readonly facilityBuildings: Building[];
  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly buildingCurrentPowerByType = new Map<BuildingType, number>();
  private readonly buildingQueueTypes = new Set<BuildingType>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly buildingStartInFlightByType = new Set<BuildingType>();
  private readonly buildingStartErrorByType = new Map<BuildingType, string>();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    const allBuildings = Array.from(buildingBlueprints.buildingsMap.values());
    this.resourceBuildings = allBuildings.filter((building) => !building.isFacility);
    this.facilityBuildings = allBuildings.filter((building) => building.isFacility);
    this.buildingBlueprintsByType = new Map(buildingBlueprints.buildingsMap);
  }

  public ngOnInit(): void {
    this.loadOwnedPlanets();
  }

  protected selectedPlanet(): ClientPlanetDto | null {
    if (!this.selectedPlanetId) {
      return null;
    }

    return this.ownedPlanets.find((planet) => this.planetId(planet) === this.selectedPlanetId) ?? null;
  }

  protected visibleBuildings(): Building[] {
    return this.selectedMode === 'resources' ? this.resourceBuildings : this.facilityBuildings;
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
            error?.error?.error ?? 'Unable to add building to queue.'
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
    const industryPower = this.currentIndustryPower();
    let cumulativeRemaining = 0;

    return queueEntries.map((entry, index) => {
      const buildingType = entry.buildingType;
      const toLevel = entry.nextLevel;
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
        },
        error: () => {
          this.loadError = 'Unable to load owned planets.';
        }
      });
  }

  private rebuildSelectedPlanetState(): void {
    this.buildingLevelsByType.clear();
    this.buildingCurrentPowerByType.clear();
    this.buildingQueueTypes.clear();
    this.techLevelsByType.clear();
    this.buildingStartInFlightByType.clear();
    this.buildingStartErrorByType.clear();

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
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.DEUTERIUM_SYNTHESIZER, adaptiveTechLevel, planet.info.planetaryParameters.deuteriumModifier) * energyEfficiency, 2),
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
    const fusionProduction = this.getProductionAtLevelByType(
      BuildingType.FUSION_REACTOR,
      levels.get(BuildingType.FUSION_REACTOR) ?? 0
    );

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
      : this.getProductionAtLevelByType(BuildingType.NANITE_FACTORY, naniteFactoryLevel);

    const industryPower = roboticsPower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    return !Number.isFinite(industryPower) || industryPower <= 0 ? 0 : Math.floor(industryPower * this.currentEnergyEfficiency());
  }

  private currentShipyardPower(): number {
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const shipyardLevel = this.buildingLevel(BuildingType.SHIPYARD);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);

    const shipyardBasePower = shipyardLevel <= 0
      ? 0
      : this.getProductionAtLevelByType(BuildingType.SHIPYARD, shipyardLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.getProductionAtLevelByType(BuildingType.NANITE_FACTORY, naniteFactoryLevel);

    const shipyardPower = shipyardBasePower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    return !Number.isFinite(shipyardPower) || shipyardPower <= 0 ? 0 : Math.floor(shipyardPower * this.currentEnergyEfficiency());
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
        label: `B ${requirement.building}: ${currentLevel}/${requiredLevel}`,
        isMet: currentLevel >= requiredLevel
      });
    }

    for (const requirement of building.techRequirements) {
      const requiredLevel = Math.ceil(targetLevel * requirement.level);
      const currentLevel = this.techLevel(requirement.tech);
      rows.push({
        label: `T ${requirement.tech}: ${currentLevel}/${requiredLevel}`,
        isMet: currentLevel >= requiredLevel
      });
    }

    return rows;
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

    const value = building.production1[level - 1];
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

  private roundNumber(value: number, precision: number): number {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
  }
}
