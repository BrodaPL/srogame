import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
import type { ClientPlanetDto } from '../../models/game-api-types';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { Ship } from '../../models/fleets/ship';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { ResourceDisplay, ResourcesComponent } from '../ui/resources/resources.component';

type PlanetTab = 'resources' | 'facilities' | 'ships' | 'defences' | 'operations' | 'queues';

type EnergyState = {
  used: number;
  available: number;
};

@Component({
  selector: 'app-planet-view',
  imports: [TopMenuComponent, ResourcesComponent, FormsModule],
  templateUrl: './planet-view.component.html'
})
export class PlanetViewComponent implements OnInit {
  protected planet: ClientPlanetDto | null = null;
  protected isLoading = false;
  protected loadError: string | null = null;
  protected activeTab: PlanetTab = 'resources';
  protected coordinatesLabel = '--:--:--';

  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;

  protected readonly resourceBuildings: Building[];
  protected readonly facilityBuildings: Building[];
  protected readonly shipBlueprints: Ship[];

  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly buildingQueueTypes = new Set<BuildingType>();
  private readonly shipAmountInputs = new Map<ShipType, string>();
  private currentPlanetRequestKey = 0;
  private pendingPlanetRequests = 0;
  private loadingSafetyTimer: ReturnType<typeof setTimeout> | null = null;

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
  }

  public ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const x = this.parseNonNegativeInt(params.get('x'));
      const y = this.parseNonNegativeInt(params.get('y'));
      const z = this.parseNonNegativeInt(params.get('z'));

      if (x === null || y === null || z === null) {
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

  protected setTab(tab: PlanetTab): void {
    this.activeTab = tab;
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
    const level = this.buildingLevel(building.type);
    return level * (building.powerConsumption ?? 0);
  }

  protected buildingBuildLabel(building: Building): string {
    return this.isBuildingInQueue(building.type) ? 'Building in progress...' : 'Build';
  }

  protected canBuildBuilding(building: Building): boolean {
    if (!this.planet || this.planet.info.ownerId === null || this.isBuildingInQueue(building.type)) {
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

    const projectedLevels = new Map(this.buildingLevelsByType);
    projectedLevels.set(building.type, levelWeAreUpgradingTo);
    const projectedEnergy = this.calculateEnergyState(projectedLevels);
    return projectedEnergy.available >= projectedEnergy.used;
  }

  protected shipAmountInput(shipType: ShipType): string {
    return this.shipAmountInputs.get(shipType) ?? '';
  }

  protected onShipAmountInput(shipType: ShipType, rawValue: string): void {
    this.shipAmountInputs.set(shipType, rawValue);
  }

  protected shipTotalCostLabel(ship: Ship): string {
    const amount = this.shipAmount(ship.type);
    if (amount === null) {
      return '--';
    }

    const total = this.multiplyCost(ship.cost, amount);
    return `M ${total.metal}, C ${total.crystal}, D ${total.deuterium}`;
  }

  protected canBuildShip(ship: Ship): boolean {
    if (!this.planet || this.planet.info.ownerId === null) {
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

    const energy = this.calculateEnergyState(this.buildingLevelsByType);
    return energy.available >= energy.used;
  }

  protected hasBuildingQueueEntries(): boolean {
    return (this.planet?.objects.buildingQueue?.length ?? 0) > 0;
  }

  protected hasShipQueueEntries(): boolean {
    return (this.planet?.objects.shipyardQueue?.length ?? 0) > 0;
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

  private loadPlanet(x: number, y: number, z: number): void {
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
    this.techLevelsByType.clear();
    this.buildingQueueTypes.clear();

    if (!this.planet) {
      return;
    }

    for (const entry of this.planet.objects.buildingsLevels) {
      this.buildingLevelsByType.set(entry.type as BuildingType, entry.level);
    }

    for (const queued of this.planet.objects.buildingQueue) {
      this.buildingQueueTypes.add(queued.type as BuildingType);
    }

    for (const entry of this.planet.reportData?.techLevels ?? []) {
      this.techLevelsByType.set(entry.type as TechnologyType, entry.level);
    }

    this.updateResourceDisplays();
  }

  private updateResourceDisplays(): void {
    if (!this.planet) {
      this.metalDisplay = null;
      this.crystalDisplay = null;
      this.deuteriumDisplay = null;
      this.energyDisplay = null;
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

    const energy = this.calculateEnergyState(this.buildingLevelsByType);
    this.energyDisplay = {
      used: energy.used,
      available: energy.available
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
    return baseProduction * (1 + adaptiveTechLevel / 100) * modifier;
  }

  private storageCapacity(storageType: BuildingType): number {
    return this.getProductionAtLevelByType(storageType, this.buildingLevel(storageType));
  }

  private calculateEnergyState(levels: Map<BuildingType, number>): EnergyState {
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

      usedEnergy += level * (blueprint.powerConsumption ?? 0);
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
    const raw = this.shipAmountInputs.get(shipType)?.trim() ?? '';
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
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

  private isBuildingInQueue(buildingType: BuildingType): boolean {
    return this.buildingQueueTypes.has(buildingType);
  }

  private getProductionAtLevelByType(buildingType: BuildingType, level: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    return this.getProductionAtLevel(blueprint, level);
  }

  private getProductionAtLevel(building: Building, level: number): number {
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
