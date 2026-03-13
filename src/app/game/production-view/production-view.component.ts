import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import { Ship } from '../../models/fleets/ship';
import type { ClientPlanetDto, ShipyardQueueEntryDto, StartShipyardConstructionRequest } from '../../models/game-api-types';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { PlanetPowersDisplay, ResourceDisplay, ResourcesComponent } from '../ui/resources/resources.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

type ProductionMode = 'shipyard' | 'defences';
type EnergyState = { used: number; available: number };
type ShipCostRowVm = { label: string; amount: number | null; isEnough: boolean; isPlaceholder: boolean };
type ShipRequirementRowVm = { label: string; isMet: boolean };
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

@Component({
  selector: 'app-production-view',
  imports: [TopMenuComponent, ResourcesComponent, MiniPlanetPreviewComponent, FormsModule],
  templateUrl: './production-view.component.html',
  styleUrl: './production-view.component.css'
})
export class ProductionViewComponent implements OnInit {
  protected readonly modeOptions: Array<{ value: ProductionMode; label: string }> = [
    { value: 'shipyard', label: 'Shipyard' },
    { value: 'defences', label: 'Defences' }
  ];
  protected readonly shipBlueprints: Ship[];

  protected isLoading = false;
  protected loadError: string | null = null;
  protected selectedMode: ProductionMode = 'shipyard';
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected selectedPlanetId: string | null = null;
  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;

  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly shipBlueprintsByType: Map<ShipType, Ship>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly buildingCurrentPowerByType = new Map<BuildingType, number>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly shipStartInFlightByType = new Set<ShipType>();
  private readonly shipStartErrorByType = new Map<ShipType, string>();
  private readonly shipAmountInputs = new Map<ShipType, string>();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    this.buildingBlueprintsByType = new Map(buildingBlueprints.buildingsMap);

    const shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();
    this.shipBlueprints = Array.from(shipBlueprints.shipsMap.values());
    this.shipBlueprintsByType = new Map(shipBlueprints.shipsMap);
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

  protected trackPlanet(_index: number, planet: ClientPlanetDto): string {
    return this.planetId(planet);
  }

  protected trackShipQueueRow(_index: number, row: ShipQueueRowVm): string {
    return `${row.position}:${row.shipType}:${row.amountTotal}`;
  }

  protected selectedPlanetLabel(): string {
    const planet = this.selectedPlanet();
    if (!planet) {
      return 'No planet selected';
    }

    return `${planet.basicInfo.name} (${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z})`;
  }

  protected selectPlanet(planet: ClientPlanetDto): void {
    const nextPlanetId = this.planetId(planet);
    if (nextPlanetId !== this.selectedPlanetId) {
      this.shipAmountInputs.clear();
    }

    this.selectedPlanetId = nextPlanetId;
    this.rebuildSelectedPlanetState();
  }

  protected isSelectedPlanet(planet: ClientPlanetDto): boolean {
    return this.planetId(planet) === this.selectedPlanetId;
  }

  protected shipAmountInput(shipType: ShipType): string {
    return this.shipAmountInputs.get(shipType) ?? '';
  }

  protected onShipAmountInput(shipType: ShipType, rawValue: unknown): void {
    const normalized = typeof rawValue === 'number' ? String(rawValue) : typeof rawValue === 'string' ? rawValue : '';
    this.shipAmountInputs.set(shipType, normalized);
  }

  protected shipSingleCostRows(ship: Ship): ShipCostRowVm[] {
    const currentResources = this.selectedPlanet()?.objects.resources;
    return [
      { label: 'M', amount: ship.cost.metal, isEnough: (currentResources?.metal ?? 0) >= ship.cost.metal, isPlaceholder: false },
      { label: 'C', amount: ship.cost.crystal, isEnough: (currentResources?.crystal ?? 0) >= ship.cost.crystal, isPlaceholder: false },
      { label: 'D', amount: ship.cost.deuterium, isEnough: (currentResources?.deuterium ?? 0) >= ship.cost.deuterium, isPlaceholder: false }
    ];
  }

  protected shipTotalCostRows(ship: Ship): ShipCostRowVm[] {
    const amount = this.shipAmount(ship.type);
    if (amount === null) {
      return [
        { label: 'M', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'C', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'D', amount: null, isEnough: true, isPlaceholder: true }
      ];
    }

    const total = this.multiplyCost(ship.cost, amount);
    const currentResources = this.selectedPlanet()?.objects.resources;
    return [
      { label: 'M', amount: total.metal, isEnough: (currentResources?.metal ?? 0) >= total.metal, isPlaceholder: false },
      { label: 'C', amount: total.crystal, isEnough: (currentResources?.crystal ?? 0) >= total.crystal, isPlaceholder: false },
      { label: 'D', amount: total.deuterium, isEnough: (currentResources?.deuterium ?? 0) >= total.deuterium, isPlaceholder: false }
    ];
  }

  protected unmetRequirementRows(ship: Ship): ShipRequirementRowVm[] {
    return this.shipRequirementRows(ship).filter((row) => !row.isMet);
  }

  protected unmetRequirementsLabel(ship: Ship): string | null {
    const unmetRows = this.unmetRequirementRows(ship);
    if (unmetRows.length === 0) {
      return null;
    }

    return `Requirements ${unmetRows.length}/${this.shipRequirementRows(ship).length}`;
  }

  protected unmetRequirementsTooltip(ship: Ship): string | null {
    const unmetRows = this.unmetRequirementRows(ship);
    if (unmetRows.length === 0) {
      return null;
    }

    return unmetRows.map((row) => row.label).join('\n');
  }

  protected shipBuildLabel(ship: Ship): string {
    return this.isHeadShipQueueType(ship.type) ? 'Order more' : 'Build';
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

  protected canBuildShip(ship: Ship): boolean {
    const planet = this.selectedPlanet();
    if (!planet || planet.info.ownerId === null || this.buildingLevel(BuildingType.SHIPYARD) <= 0) {
      return false;
    }
    if (this.shipStartInFlightByType.has(ship.type) || this.isShipQueueFull()) {
      return false;
    }

    const amount = this.shipAmount(ship.type);
    if (amount === null || !this.hasEnoughResources(this.multiplyCost(ship.cost, amount))) {
      return false;
    }
    if (!this.hasBuildingRequirements(ship.buildingRequirements, 1) || !this.hasTechRequirements(ship.techRequirements, 1)) {
      return false;
    }

    return true;
  }

  protected onBuildShip(ship: Ship): void {
    if (!this.canBuildShip(ship)) {
      return;
    }

    const planet = this.selectedPlanet();
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
          this.ownedPlanets = this.ownedPlanets.map((entry) =>
            this.planetId(entry) === this.planetId(updatedPlanet) ? updatedPlanet : entry
          );
          this.selectedPlanetId = this.planetId(updatedPlanet);
          this.rebuildSelectedPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.shipStartErrorByType.set(ship.type, error?.error?.error ?? 'Unable to add ship order to queue.');
          this.cdr.markForCheck();
        }
      });
  }

  protected shipStartError(ship: Ship): string | null {
    return this.shipStartErrorByType.get(ship.type) ?? null;
  }

  protected hasShipQueueEntries(): boolean {
    return (this.selectedPlanet()?.objects.shipyardQueue?.length ?? 0) > 0;
  }

  protected currentShipQueueLength(): number {
    return this.selectedPlanet()?.objects.shipyardQueue?.length ?? 0;
  }

  protected maxShipQueueLength(): number {
    const rawLimit = 1 + Math.sqrt(Math.max(0, this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY) + this.buildingLevel(BuildingType.SHIPYARD)));
    return Math.max(1, Math.floor(rawLimit));
  }

  protected shipQueueRows(): ShipQueueRowVm[] {
    const queueEntries = this.selectedPlanet()?.objects.shipyardQueue ?? [];
    const shipyardPower = this.currentShipyardPower();
    let cumulativeRemaining = 0;

    return queueEntries.map((entry, index) => {
      const shipType = this.queueEntryShipType(entry);
      const amountTotal = this.queueEntryShipAmount(entry);
      const investedShipyardPower = this.queueEntryInvestedShipyardPower(entry);
      const amountCompleted = this.shipAmountCompleted(shipType, amountTotal, investedShipyardPower);
      const singleShipBaseConstructionTime = this.baseShipConstructionTime(shipType, 1);
      const currentShipInvestedShipyardPower = this.currentShipInvestedPower(
        amountCompleted,
        amountTotal,
        investedShipyardPower,
        singleShipBaseConstructionTime
      );
      const baseTotalConstructionTime = this.baseShipConstructionTime(shipType, amountTotal);
      const remaining = Math.max(0, baseTotalConstructionTime - investedShipyardPower);
      cumulativeRemaining += remaining;

      return {
        position: index + 1,
        shipType,
        amountCompleted,
        amountTotal,
        currentShipInvestedShipyardPower,
        currentShipBaseConstructionTime: singleShipBaseConstructionTime,
        estimatedTurnsForCompletion: shipyardPower > 0 ? Math.ceil(cumulativeRemaining / shipyardPower) : null,
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
    this.techLevelsByType.clear();
    this.shipStartInFlightByType.clear();
    this.shipStartErrorByType.clear();

    const planet = this.selectedPlanet();
    if (!planet) {
      this.metalDisplay = null;
      this.crystalDisplay = null;
      this.deuteriumDisplay = null;
      this.energyDisplay = null;
      this.powersDisplay = null;
      return;
    }

    for (const entry of planet.objects.buildingsLevels) {
      this.buildingLevelsByType.set(entry.type as BuildingType, entry.level);
    }
    for (const entry of planet.objects.buildingsCurrentPowerConsumption ?? []) {
      this.buildingCurrentPowerByType.set(entry.type as BuildingType, this.roundNumber(Math.max(0, entry.currentPowerConsumption), 2));
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
      this.powersDisplay = null;
      return;
    }

    const adaptiveTechLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const resources = planet.objects.resources;

    this.metalDisplay = {
      current: resources.metal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.METAL_MINE, adaptiveTechLevel, planet.info.planetaryParameters.metalModifier), 2),
      capacityPercent: this.capacityPercent(resources.metal, this.storageCapacity(BuildingType.METAL_STORAGE))
    };
    this.crystalDisplay = {
      current: resources.crystal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.CRYSTAL_MINE, adaptiveTechLevel, planet.info.planetaryParameters.crystalModifier), 2),
      capacityPercent: this.capacityPercent(resources.crystal, this.storageCapacity(BuildingType.CRYSTAL_STORAGE))
    };
    this.deuteriumDisplay = {
      current: resources.deuterium,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.DEUTERIUM_SYNTHESIZER, adaptiveTechLevel, planet.info.planetaryParameters.deuteriumModifier), 2),
      capacityPercent: this.capacityPercent(resources.deuterium, this.storageCapacity(BuildingType.DEUTERIUM_TANK))
    };

    const energy = this.calculateEnergyState(this.buildingLevelsByType, this.buildingCurrentPowerByType);
    this.energyDisplay = { used: energy.used, available: energy.available };
    this.powersDisplay = {
      industryPower: this.currentIndustryPower(),
      shipyardPower: this.currentShipyardPower(),
      researchPower: this.currentResearchPower(),
      industryPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.ROBOTICS_FACTORY)
        || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY),
      shipyardPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.SHIPYARD)
        || this.isBuildingNotUsingFullPower(BuildingType.NANITE_FACTORY),
      researchPowerLimited: this.isBuildingNotUsingFullPower(BuildingType.RESEARCH_LAB)
    };
  }

  private calculateEnergyState(
    levels: Map<BuildingType, number>,
    currentPowerByType: Map<BuildingType, number>
  ): EnergyState {
    const solarProduction = this.getProductionAtLevelByType(BuildingType.SOLAR_WIND_GEOTHERMAL, levels.get(BuildingType.SOLAR_WIND_GEOTHERMAL) ?? 0);
    const nuclearProduction = this.getProductionAtLevelByType(BuildingType.NUCLEAR_PLANT, levels.get(BuildingType.NUCLEAR_PLANT) ?? 0);
    const fusionProduction = this.getProductionAtLevelByType(BuildingType.FUSION_REACTOR, levels.get(BuildingType.FUSION_REACTOR) ?? 0);
    const parameters = this.selectedPlanet()?.info.planetaryParameters;
    const availableEnergy = (
      (solarProduction * (parameters?.energyModifierRES ?? 1))
      + (nuclearProduction * (parameters?.energyModifierNuclear ?? 1))
      + fusionProduction
    ) * (1 + ((this.techLevel(TechnologyType.ENERGY_TECHNOLOGY) * 2) / 100));

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
      usedEnergy += selectedConsumption === undefined
        ? maxConsumption
        : Math.min(maxConsumption, Math.max(0, selectedConsumption));
    }

    return {
      used: this.roundNumber(usedEnergy, 2),
      available: this.roundNumber(availableEnergy, 2)
    };
  }

  private currentIndustryPower(): number {
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const roboticsFactoryLevel = this.buildingLevel(BuildingType.ROBOTICS_FACTORY);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);
    const roboticsPower = roboticsFactoryLevel <= 0 ? 5 : this.getProductionAtLevelByType(BuildingType.ROBOTICS_FACTORY, roboticsFactoryLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0 ? 1 : this.getProductionAtLevelByType(BuildingType.NANITE_FACTORY, naniteFactoryLevel);
    const industryPower = roboticsPower * naniteMultiplier * industryModifier;
    return !Number.isFinite(industryPower) || industryPower <= 0 ? 0 : Math.floor(industryPower);
  }

  private currentShipyardPower(): number {
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const shipyardLevel = this.buildingLevel(BuildingType.SHIPYARD);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);
    const shipyardBasePower = shipyardLevel <= 0 ? 0 : this.getProductionAtLevelByType(BuildingType.SHIPYARD, shipyardLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0 ? 1 : this.getProductionAtLevelByType(BuildingType.NANITE_FACTORY, naniteFactoryLevel);
    const shipyardPower = shipyardBasePower * naniteMultiplier * industryModifier;
    return !Number.isFinite(shipyardPower) || shipyardPower <= 0 ? 0 : Math.floor(shipyardPower);
  }

  private currentResearchPower(): number {
    const scienceModifier = this.selectedPlanet()?.info.planetaryParameters.scienceModifier ?? 1;
    const researchLabLevel = this.buildingLevel(BuildingType.RESEARCH_LAB);
    const researchLabProduction = this.getProductionAtLevelByType(BuildingType.RESEARCH_LAB, researchLabLevel);
    const computerMultiplier = 1 + ((this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY) * 5) / 100);
    const researchPower = researchLabProduction * computerMultiplier * scienceModifier;
    return !Number.isFinite(researchPower) || researchPower <= 0 ? 0 : Math.floor(researchPower);
  }

  private shipRequirementRows(ship: Ship): ShipRequirementRowVm[] {
    const rows: ShipRequirementRowVm[] = [];

    for (const requirement of ship.buildingRequirements) {
      const requiredLevel = Math.ceil(requirement.level);
      const currentLevel = this.buildingLevel(requirement.building);
      rows.push({ label: `B ${requirement.building}: ${currentLevel}/${requiredLevel}`, isMet: currentLevel >= requiredLevel });
    }
    for (const requirement of ship.techRequirements) {
      const requiredLevel = Math.ceil(requirement.level);
      const currentLevel = this.techLevel(requirement.tech);
      rows.push({ label: `T ${requirement.tech}: ${currentLevel}/${requiredLevel}`, isMet: currentLevel >= requiredLevel });
    }

    return rows;
  }

  private hasBuildingRequirements(requirements: BuildingRequirement[], levelWeAreUpgradingTo: number): boolean {
    for (const requirement of requirements) {
      if (this.buildingLevel(requirement.building) < Math.ceil(levelWeAreUpgradingTo * requirement.level)) {
        return false;
      }
    }

    return true;
  }

  private hasTechRequirements(requirements: TechRequirement[], levelWeAreUpgradingTo: number): boolean {
    for (const requirement of requirements) {
      if (this.techLevel(requirement.tech) < Math.ceil(levelWeAreUpgradingTo * requirement.level)) {
        return false;
      }
    }

    return true;
  }

  private techLevel(techType: TechnologyType): number {
    return this.techLevelsByType.get(techType) ?? 0;
  }

  private buildingLevel(buildingType: BuildingType): number {
    return this.buildingLevelsByType.get(buildingType) ?? 0;
  }

  private shipAmount(shipType: ShipType): number | null {
    const raw = (this.shipAmountInputs.get(shipType) ?? '').trim();
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : null;
  }

  private multiplyCost(baseCost: ResourcesPack, amount: number): ResourcesPack {
    return new ResourcesPack(baseCost.metal * amount, baseCost.crystal * amount, baseCost.deuterium * amount);
  }

  private hasEnoughResources(cost: ResourcesPack): boolean {
    const resources = this.selectedPlanet()?.objects.resources;
    return !!resources
      && resources.metal >= cost.metal
      && resources.crystal >= cost.crystal
      && resources.deuterium >= cost.deuterium;
  }

  private isShipQueueFull(): boolean {
    return this.currentShipQueueLength() >= this.maxShipQueueLength();
  }

  private isHeadShipQueueType(shipType: ShipType): boolean {
    const firstQueueEntry = this.selectedPlanet()?.objects.shipyardQueue?.[0];
    return !!firstQueueEntry && this.queueEntryShipType(firstQueueEntry) === shipType;
  }

  private queueEntryShipType(entry: ShipyardQueueEntryDto): ShipType {
    if ((entry as { shipType?: unknown }).shipType) {
      return (entry as { shipType: ShipType }).shipType;
    }

    return (entry as unknown as { type: ShipType }).type;
  }

  private queueEntryShipAmount(entry: ShipyardQueueEntryDto): number {
    const amount = Number((entry as { amount?: unknown }).amount);
    return Number.isInteger(amount) && amount >= 1 ? amount : 1;
  }

  private queueEntryInvestedShipyardPower(entry: ShipyardQueueEntryDto): number {
    const invested = Number((entry as { investedShipyardPower?: unknown }).investedShipyardPower);
    return !Number.isFinite(invested) || invested < 0 ? 0 : Math.floor(invested);
  }

  private baseShipConstructionTime(shipType: ShipType, amount: number): number {
    const blueprint = this.shipBlueprintsByType.get(shipType);
    if (!blueprint || amount < 1) {
      return 0;
    }

    return Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()) * amount);
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

    return Math.max(0, Math.min(amount, Math.floor(investedShipyardPower / singleCostTotal)));
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

    return Math.max(0, Math.min(singleShipBaseConstructionTime, investedShipyardPower % singleShipBaseConstructionTime));
  }

  private storageCapacity(buildingType: BuildingType): number {
    return this.getProductionAtLevelByType(buildingType, this.buildingLevel(buildingType));
  }

  private resourceGain(buildingType: BuildingType, adaptiveTechLevel: number, planetaryModifier: number): number {
    return this.currentBuildingProduction(buildingType) * (1 + adaptiveTechLevel / 100) * planetaryModifier;
  }

  private currentBuildingProduction(buildingType: BuildingType): number {
    return this.getProductionAtLevelByType(buildingType, this.buildingLevel(buildingType));
  }

  private getProductionAtLevelByType(buildingType: BuildingType, level: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    return blueprint ? this.getProductionAtLevel(blueprint, level) : 0;
  }

  private getProductionAtLevel(building: Building, level: number): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    return Math.floor(baseProduction * this.powerUtilizationAtLevel(building.type, level, building.powerConsumption ?? 0));
  }

  private getRawProductionAtLevel(building: Building, level: number): number {
    if (level <= 0) {
      return 0;
    }

    const value = building.production1[level - 1];
    return Number.isFinite(value) ? value : 0;
  }

  private powerUtilizationAtLevel(buildingType: BuildingType, level: number, powerPerLevel: number): number {
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

    return (this.buildingCurrentPowerByType.get(buildingType) ?? maxConsumption) < maxConsumption;
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

      defaults.set(buildingType, this.roundNumber(Math.max(0, level * (blueprint.powerConsumption ?? 0)), 2));
    }

    return defaults;
  }

  private maxBuildingPowerConsumption(buildingType: BuildingType): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    return this.roundNumber(Math.max(0, this.buildingLevel(buildingType) * (blueprint.powerConsumption ?? 0)), 2);
  }

  private setBuildingCurrentPowerConsumption(buildingType: BuildingType, powerConsumption: number): void {
    const maxConsumption = this.maxBuildingPowerConsumption(buildingType);
    if (maxConsumption <= 0) {
      this.buildingCurrentPowerByType.delete(buildingType);
      return;
    }

    this.buildingCurrentPowerByType.set(
      buildingType,
      this.roundNumber(Math.min(maxConsumption, Math.max(0, powerConsumption)), 2)
    );
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
