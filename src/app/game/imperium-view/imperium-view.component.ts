import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingType } from '../../models/enums/building-type';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import type { ShipInstance } from '../../models/fleets/ship-instance';
import type {
  BuildingQueueEntryDto,
  ClientPlanetDto,
  ShipyardQueueEntryDto,
  TechnologyQueueEntryDto
} from '../../models/game-api-types';
import { energyDeficitEfficiencyMultiplier, energyDeficitPenaltyPercent } from '../../models/planets/energy-deficit';
import { industryPowerMultiplier, researchPowerMultiplier } from '../../models/tech/technology-effects';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { PlanetPowersDisplay, ResourceDisplay, ResourcesComponent } from '../ui/resources/resources.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { TutorialService } from '../../tutorial/tutorial.service';

type ImperiumSortOption =
  | 'coordinates'
  | 'name'
  | 'metalIncome'
  | 'totalIncome'
  | 'industryPower';

type ImperiumFilterOption =
  | 'all'
  | 'attention'
  | 'activeQueues'
  | 'idleQueues';

type EnergyState = {
  used: number;
  available: number;
};

type PlanetPowerState = {
  industryPower: number;
  shipyardPower: number;
  researchPower: number;
  industryPowerLimited: boolean;
  shipyardPowerLimited: boolean;
  researchPowerLimited: boolean;
};

type ImperiumPlanetVm = {
  id: string;
  planet: ClientPlanetDto;
  coordinatesLabel: string;
  totalIncome: number;
  metalIncome: number;
  crystalIncome: number;
  deuteriumIncome: number;
  energy: EnergyState;
  powers: PlanetPowerState;
  buildingQueueSummary: string[];
  shipyardQueueSummary: string[];
  researchSummary: string;
  hasAttention: boolean;
  hasActiveQueues: boolean;
  isQueueIdle: boolean;
  attentionLabels: string[];
};

type ImperiumAttentionVm = {
  key: string;
  title: string;
  description: string;
  planets: ImperiumAttentionPlanetVm[];
};

type ImperiumAttentionPlanetVm = {
  label: string;
  x: number;
  y: number;
  z: number;
  warningCount: number;
};

type ImperiumShipSummaryVm = {
  shipType: ShipType;
  amount: number;
  isZero: boolean;
};

type ImperiumBuildingStatsVm = {
  buildingType: BuildingType;
  averageLevel: number;
  minLevel: number;
  maxLevel: number;
  allZero: boolean;
};

@Component({
  selector: 'app-imperium-view',
  imports: [
    TopMenuComponent,
    ResourcesComponent,
    MiniPlanetPreviewComponent,
    FormsModule,
    RouterLink
  ],
  templateUrl: './imperium-view.component.html',
  styleUrl: './imperium-view.component.css'
})
export class ImperiumViewComponent implements OnInit {
  protected readonly sortOptions: Array<{ value: ImperiumSortOption; label: string }> = [
    { value: 'coordinates', label: 'Coordinates' },
    { value: 'name', label: 'Name' },
    { value: 'metalIncome', label: 'Metal income' },
    { value: 'totalIncome', label: 'Total income' },
    { value: 'industryPower', label: 'Industry power' }
  ];

  protected readonly filterOptions: Array<{ value: ImperiumFilterOption; label: string }> = [
    { value: 'all', label: 'All planets' },
    { value: 'attention', label: 'Needs attention' },
    { value: 'activeQueues', label: 'Active queues' },
    { value: 'idleQueues', label: 'Idle queues' }
  ];

  protected isLoading = false;
  protected loadError: string | null = null;
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected planetVms: ImperiumPlanetVm[] = [];
  protected attentionItems: ImperiumAttentionVm[] = [];
  protected shipSummaries: ImperiumShipSummaryVm[] = [];
  protected buildingStats: ImperiumBuildingStatsVm[] = [];

  protected selectedSort: ImperiumSortOption = 'coordinates';
  protected selectedFilter: ImperiumFilterOption = 'all';

  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected energyTooltip: string | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;

  protected totalPlanets = 0;
  protected totalShips = 0;
  protected activeBuildingQueues = 0;
  protected activeShipyardQueues = 0;
  protected activeResearchRoles = 0;
  protected playerName = 'Player';

  private readonly buildings = Array.from(BuildingBlueprintsFactory.fromDefaultJson().buildingsMap.values());
  private readonly buildingByType = new Map<BuildingType, Building>(
    this.buildings.map((building) => [building.type, building])
  );
  private readonly ships = Array.from(ShipBlueprintsFactory.fromDefaultJson().shipsMap.values());

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {}

  public ngOnInit(): void {
    this.loadOwnedPlanets();
  }

  protected visiblePlanets(): ImperiumPlanetVm[] {
    const filtered = this.planetVms.filter((planetVm) => this.matchesFilter(planetVm));
    return [...filtered].sort((left, right) => this.comparePlanets(left, right));
  }

  protected trackPlanet(_index: number, planetVm: ImperiumPlanetVm): string {
    return planetVm.id;
  }

  protected trackAttention(_index: number, attention: ImperiumAttentionVm): string {
    return attention.key;
  }

  protected trackShipSummary(_index: number, shipSummary: ImperiumShipSummaryVm): string {
    return shipSummary.shipType;
  }

  protected trackBuildingStats(_index: number, stats: ImperiumBuildingStatsVm): string {
    return stats.buildingType;
  }

  protected formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
      return '--';
    }

    return `${Math.round(value * 100) / 100}`;
  }

  protected warningCountClass(warningCount: number): string {
    if (warningCount >= 4) {
      return 'imperium-view__attention-link--critical';
    }

    if (warningCount === 3) {
      return 'imperium-view__attention-link--high';
    }

    if (warningCount === 2) {
      return 'imperium-view__attention-link--medium';
    }

    return 'imperium-view__attention-link--low';
  }

  protected planetAlertClass(warningCount: number): string {
    return this.warningCountClass(warningCount);
  }

  private loadOwnedPlanets(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.playerName = session.playerName;
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
          this.rebuildDashboardState();
          this.tutorialService.autoOpenTutorial('imperiumView');
        },
        error: () => {
          this.loadError = 'Unable to load owned planets.';
        }
      });
  }

  private rebuildDashboardState(): void {
    const techLevels = this.extractGlobalTechLevels(this.ownedPlanets);
    this.planetVms = this.ownedPlanets.map((planet) => this.createPlanetVm(planet, techLevels));
    this.attentionItems = this.createAttentionItems(this.planetVms);
    this.shipSummaries = this.createShipSummaries(this.ownedPlanets);
    this.buildingStats = this.createBuildingStats(this.ownedPlanets);
    this.rebuildSummaryDisplays(this.planetVms);
  }

  private rebuildSummaryDisplays(planetVms: ImperiumPlanetVm[]): void {
    const totalResources = {
      metal: 0,
      crystal: 0,
      deuterium: 0
    };
    const totalIncome = {
      metal: 0,
      crystal: 0,
      deuterium: 0
    };
    const totalResourceCapacity = {
      metal: 0,
      crystal: 0,
      deuterium: 0
    };
    let totalEnergyUsed = 0;
    let totalEnergyAvailable = 0;
    let totalEnergyPenalty = 0;
    let totalIndustryPower = 0;
    let totalShipyardPower = 0;
    let totalResearchPower = 0;
    let hasIndustryLimit = false;
    let hasShipyardLimit = false;
    let hasResearchLimit = false;

    this.totalPlanets = planetVms.length;
    this.totalShips = this.shipSummaries.reduce((sum, entry) => sum + entry.amount, 0);
    this.activeBuildingQueues = 0;
    this.activeShipyardQueues = 0;
    this.activeResearchRoles = 0;

    for (const planetVm of planetVms) {
      totalResources.metal += planetVm.planet.objects.resources.metal;
      totalResources.crystal += planetVm.planet.objects.resources.crystal;
      totalResources.deuterium += planetVm.planet.objects.resources.deuterium;

      totalIncome.metal += planetVm.metalIncome;
      totalIncome.crystal += planetVm.crystalIncome;
      totalIncome.deuterium += planetVm.deuteriumIncome;

      const resourceCapacity = this.resourceCapacity(planetVm.planet);
      totalResourceCapacity.metal += resourceCapacity.metal;
      totalResourceCapacity.crystal += resourceCapacity.crystal;
      totalResourceCapacity.deuterium += resourceCapacity.deuterium;

      totalEnergyUsed += planetVm.energy.used;
      totalEnergyAvailable += planetVm.energy.available;
      totalEnergyPenalty += energyDeficitPenaltyPercent(planetVm.energy.available, planetVm.energy.used);
      totalIndustryPower += planetVm.powers.industryPower;
      totalShipyardPower += planetVm.powers.shipyardPower;
      totalResearchPower += planetVm.powers.researchPower;

      hasIndustryLimit = hasIndustryLimit || planetVm.powers.industryPowerLimited;
      hasShipyardLimit = hasShipyardLimit || planetVm.powers.shipyardPowerLimited;
      hasResearchLimit = hasResearchLimit || planetVm.powers.researchPowerLimited;

      if (planetVm.buildingQueueSummary.length > 0) {
        this.activeBuildingQueues += 1;
      }

      if (planetVm.shipyardQueueSummary.length > 0) {
        this.activeShipyardQueues += 1;
      }

      if (!planetVm.researchSummary.startsWith('Idle')) {
        this.activeResearchRoles += 1;
      }
    }

    this.metalDisplay = {
      current: totalResources.metal,
      productionPerTurn: totalIncome.metal,
      capacityPercent: this.capacityPercent(totalResources.metal, totalResourceCapacity.metal)
    };
    this.crystalDisplay = {
      current: totalResources.crystal,
      productionPerTurn: totalIncome.crystal,
      capacityPercent: this.capacityPercent(totalResources.crystal, totalResourceCapacity.crystal)
    };
    this.deuteriumDisplay = {
      current: totalResources.deuterium,
      productionPerTurn: totalIncome.deuterium,
      capacityPercent: this.capacityPercent(totalResources.deuterium, totalResourceCapacity.deuterium)
    };
    this.energyDisplay = {
      used: this.roundNumber(totalEnergyUsed, 2),
      available: this.roundNumber(totalEnergyAvailable, 2)
    };
    const averageEnergyPenalty = this.ownedPlanets.length <= 0
      ? 0
      : this.roundNumber(totalEnergyPenalty / this.ownedPlanets.length, 2);
    this.energyTooltip = `Average energy penalty: ${averageEnergyPenalty}%.`;
    this.powersDisplay = {
      industryPower: this.roundNumber(totalIndustryPower, 2),
      shipyardPower: this.roundNumber(totalShipyardPower, 2),
      researchPower: this.roundNumber(totalResearchPower, 2),
      industryPowerLimited: hasIndustryLimit,
      shipyardPowerLimited: hasShipyardLimit,
      researchPowerLimited: hasResearchLimit
    };
  }

  private createPlanetVm(
    planet: ClientPlanetDto,
    techLevels: Map<TechnologyType, number>
  ): ImperiumPlanetVm {
    const incomes = this.resourceIncome(planet, techLevels);
    const energy = this.energyState(planet, techLevels);
    const powers = this.powerState(planet, techLevels);
    const buildingQueueSummary = this.buildingQueueSummary(planet.objects.buildingQueue);
    const shipyardQueueSummary = this.shipyardQueueSummary(planet.objects.shipyardQueue);
    const researchSummary = this.researchSummary(planet);
    const attentionLabels = this.planetAttentionLabels(planet, energy, powers, researchSummary);

    return {
      id: this.coordinatesLabel(planet),
      planet,
      coordinatesLabel: this.coordinatesLabel(planet),
      totalIncome: incomes.metal + incomes.crystal + incomes.deuterium,
      metalIncome: incomes.metal,
      crystalIncome: incomes.crystal,
      deuteriumIncome: incomes.deuterium,
      energy,
      powers,
      buildingQueueSummary,
      shipyardQueueSummary,
      researchSummary,
      hasAttention: attentionLabels.length > 0,
      hasActiveQueues: buildingQueueSummary.length > 0 || shipyardQueueSummary.length > 0 || !researchSummary.startsWith('Idle'),
      isQueueIdle: buildingQueueSummary.length === 0 && shipyardQueueSummary.length === 0 && researchSummary.startsWith('Idle'),
      attentionLabels
    };
  }

  private createAttentionItems(planetVms: ImperiumPlanetVm[]): ImperiumAttentionVm[] {
    return [
      this.createAttentionItem(
        'energyDeficit',
        'Energy insufficient',
        'Energy usage is above available output.',
        planetVms.filter((planetVm) => planetVm.energy.used > planetVm.energy.available)
      ),
      this.createAttentionItem(
        'energyReduction',
        'Energy reduction',
        'At least one building is manually set below its maximum power usage.',
        planetVms.filter((planetVm) => planetVm.attentionLabels.includes('Energy reduction'))
      ),
      this.createAttentionItem(
        'idleBuildingQueue',
        'Empty building queue',
        'No construction is currently queued.',
        planetVms.filter((planetVm) => planetVm.buildingQueueSummary.length === 0)
      ),
      this.createAttentionItem(
        'idleShipyardQueue',
        'Empty shipyard queue',
        'No ships are currently queued for production.',
        planetVms.filter((planetVm) => planetVm.shipyardQueueSummary.length === 0)
      ),
      this.createAttentionItem(
        'idleResearchRole',
        'No active research role',
        'Planet is neither researching nor helping another lab.',
        planetVms.filter((planetVm) => planetVm.researchSummary.startsWith('Idle'))
      ),
      this.createAttentionItem(
        'limitedIndustryPower',
        'Reduced industry power',
        'Robotics or Nanite power allocation is below the selected maximum.',
        planetVms.filter((planetVm) => planetVm.powers.industryPowerLimited)
      ),
      this.createAttentionItem(
        'limitedShipyardPower',
        'Reduced shipyard power',
        'Shipyard or Nanite power allocation is below the selected maximum.',
        planetVms.filter((planetVm) => planetVm.powers.shipyardPowerLimited)
      ),
      this.createAttentionItem(
        'limitedResearchPower',
        'Reduced research power',
        'Research Lab power allocation is below the selected maximum.',
        planetVms.filter((planetVm) => planetVm.powers.researchPowerLimited)
      )
    ].filter((entry): entry is ImperiumAttentionVm => entry !== null);
  }

  private createAttentionItem(
    key: string,
    title: string,
    description: string,
    planets: ImperiumPlanetVm[]
  ): ImperiumAttentionVm | null {
    if (planets.length === 0) {
      return null;
    }

    return {
      key,
      title,
      description,
      planets: planets.map((planetVm) => ({
        label: `${planetVm.planet.basicInfo.name} (${planetVm.coordinatesLabel})`,
        x: planetVm.planet.coordinates.x,
        y: planetVm.planet.coordinates.y,
        z: planetVm.planet.coordinates.z,
        warningCount: planetVm.attentionLabels.length
      }))
    };
  }

  private createShipSummaries(planets: ClientPlanetDto[]): ImperiumShipSummaryVm[] {
    const totals = new Map<ShipType, number>();

    for (const ship of this.ships) {
      totals.set(ship.type, 0);
    }

    for (const planet of planets) {
      for (const shipInstance of planet.objects.ships) {
        this.accumulateShipInstance(totals, shipInstance);
      }
    }

    return this.ships.map((ship) => ({
      shipType: ship.type,
      amount: totals.get(ship.type) ?? 0,
      isZero: (totals.get(ship.type) ?? 0) === 0
    }));
  }

  private createBuildingStats(planets: ClientPlanetDto[]): ImperiumBuildingStatsVm[] {
    return this.buildings.map((building) => {
      const levels = planets.map((planet) => this.buildingLevel(planet, building.type));
      const total = levels.reduce((sum, level) => sum + level, 0);
      const averageLevel = levels.length > 0 ? total / levels.length : 0;
      const minLevel = levels.length > 0 ? Math.min(...levels) : 0;
      const maxLevel = levels.length > 0 ? Math.max(...levels) : 0;

      return {
        buildingType: building.type,
        averageLevel: this.roundNumber(averageLevel, 2),
        minLevel,
        maxLevel,
        allZero: maxLevel === 0
      };
    });
  }

  private accumulateShipInstance(totals: Map<ShipType, number>, shipInstance: ShipInstance): void {
    const shipType = shipInstance.type.type;
    totals.set(shipType, (totals.get(shipType) ?? 0) + 1);

    for (const nestedShip of shipInstance.hangar ?? []) {
      this.accumulateShipInstance(totals, nestedShip);
    }
  }

  private planetAttentionLabels(
    planet: ClientPlanetDto,
    energy: EnergyState,
    powers: PlanetPowerState,
    researchSummary: string
  ): string[] {
    const labels: string[] = [];

    if (energy.used > energy.available) {
      labels.push('Energy insufficient');
    }

    if (this.hasAnyManualPowerReduction(planet)) {
      labels.push('Energy reduction');
    }

    if (planet.objects.buildingQueue.length === 0) {
      labels.push('Empty building queue');
    }

    if (planet.objects.shipyardQueue.length === 0) {
      labels.push('Empty shipyard queue');
    }

    if (researchSummary.startsWith('Idle')) {
      labels.push('No active research role');
    }

    if (powers.industryPowerLimited) {
      labels.push('Reduced industry power');
    }

    if (powers.shipyardPowerLimited) {
      labels.push('Reduced shipyard power');
    }

    if (powers.researchPowerLimited) {
      labels.push('Reduced research power');
    }

    return labels;
  }

  private resourceIncome(
    planet: ClientPlanetDto,
    techLevels: Map<TechnologyType, number>
  ): { metal: number; crystal: number; deuterium: number } {
    const adaptiveTechLevel = techLevels.get(TechnologyType.ADAPTIVE_TECHNOLOGY) ?? 0;
    const adaptiveMultiplier = 1 + (adaptiveTechLevel / 100);
    const planetaryParameters = planet.info.planetaryParameters;
    const energyState = this.energyState(planet, techLevels);
    const energyEfficiency = energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);

    const metal = Math.floor(
      this.currentBuildingProduction(planet, BuildingType.METAL_MINE)
      * adaptiveMultiplier
      * planetaryParameters.metalModifier
      * energyEfficiency
    );
    const crystal = Math.floor(
      this.currentBuildingProduction(planet, BuildingType.CRYSTAL_MINE)
      * adaptiveMultiplier
      * planetaryParameters.crystalModifier
      * energyEfficiency
    );
    const deuterium = Math.floor(
      this.currentBuildingProduction(planet, BuildingType.DEUTERIUM_SYNTHESIZER)
      * adaptiveMultiplier
      * planetaryParameters.deuteriumModifier
      * energyEfficiency
    );

    return { metal, crystal, deuterium };
  }

  private energyState(
    planet: ClientPlanetDto,
    techLevels: Map<TechnologyType, number>
  ): EnergyState {
    const planetaryParameters = planet.info.planetaryParameters;
    const energyTechLevel = techLevels.get(TechnologyType.ENERGY_TECHNOLOGY) ?? 0;

    const solarProduction = this.currentBuildingProduction(planet, BuildingType.SOLAR_WIND_GEOTHERMAL);
    const nuclearProduction = this.currentBuildingProduction(planet, BuildingType.NUCLEAR_PLANT);
    const fusionProduction = this.currentBuildingProduction(planet, BuildingType.FUSION_REACTOR);

    const available = (
      (solarProduction * planetaryParameters.energyModifierRES)
      + (nuclearProduction * planetaryParameters.energyModifierNuclear)
      + fusionProduction
    ) * (1 + ((energyTechLevel * 2) / 100));

    let used = 0;
    for (const building of this.buildings) {
      used += this.currentPowerConsumption(planet, building.type);
    }

    return {
      used: this.roundNumber(used, 2),
      available: this.roundNumber(available, 2)
    };
  }

  private powerState(
    planet: ClientPlanetDto,
    techLevels: Map<TechnologyType, number>
  ): PlanetPowerState {
    const industryModifier = planet.info.planetaryParameters.industryModifier;
    const scienceModifier = planet.info.planetaryParameters.scienceModifier;
    const adaptiveTechnologyLevel = techLevels.get(TechnologyType.ADAPTIVE_TECHNOLOGY) ?? 0;
    const computerTechnologyLevel = techLevels.get(TechnologyType.COMPUTER_TECHNOLOGY) ?? 0;
    const intergalacticResearchNetworkLevel = techLevels.get(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK) ?? 0;

    const roboticsFactoryLevel = this.buildingLevel(planet, BuildingType.ROBOTICS_FACTORY);
    const shipyardLevel = this.buildingLevel(planet, BuildingType.SHIPYARD);
    const researchLabLevel = this.buildingLevel(planet, BuildingType.RESEARCH_LAB);
    const naniteFactoryLevel = this.buildingLevel(planet, BuildingType.NANITE_FACTORY);

    const roboticsPower = roboticsFactoryLevel <= 0
      ? 5
      : this.currentBuildingProduction(planet, BuildingType.ROBOTICS_FACTORY);
    const naniteMultiplier = naniteFactoryLevel <= 0
      ? 1
      : this.currentBuildingProduction(planet, BuildingType.NANITE_FACTORY);
    const shipyardBasePower = shipyardLevel <= 0
      ? 0
      : this.currentBuildingProduction(planet, BuildingType.SHIPYARD);
    const researchLabProduction = this.currentBuildingProduction(planet, BuildingType.RESEARCH_LAB);
    const adaptiveIndustryMultiplier = industryPowerMultiplier(adaptiveTechnologyLevel);
    const totalResearchMultiplier = researchPowerMultiplier(
      computerTechnologyLevel,
      adaptiveTechnologyLevel,
      intergalacticResearchNetworkLevel
    );
    const energyState = this.energyState(planet, techLevels);
    const energyEfficiency = energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);

    return {
      industryPower: Math.max(0, Math.floor(roboticsPower * naniteMultiplier * industryModifier * adaptiveIndustryMultiplier * energyEfficiency)),
      shipyardPower: Math.max(0, Math.floor(shipyardBasePower * naniteMultiplier * industryModifier * adaptiveIndustryMultiplier * energyEfficiency)),
      researchPower: Math.max(0, Math.floor(researchLabProduction * totalResearchMultiplier * scienceModifier * energyEfficiency)),
      industryPowerLimited: this.isBuildingPowerLimited(planet, BuildingType.ROBOTICS_FACTORY)
        || this.isBuildingPowerLimited(planet, BuildingType.NANITE_FACTORY),
      shipyardPowerLimited: this.isBuildingPowerLimited(planet, BuildingType.SHIPYARD)
        || this.isBuildingPowerLimited(planet, BuildingType.NANITE_FACTORY),
      researchPowerLimited: researchLabLevel > 0 && this.isBuildingPowerLimited(planet, BuildingType.RESEARCH_LAB)
    };
  }

  private currentBuildingProduction(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const blueprint = this.buildingByType.get(buildingType);
    const level = this.buildingLevel(planet, buildingType);
    if (!blueprint || level <= 0) {
      return 0;
    }

    const rawProduction = blueprint.production1[level - 1];
    if (!Number.isFinite(rawProduction) || rawProduction <= 0) {
      return 0;
    }

    return Math.floor(rawProduction * this.powerUtilization(planet, buildingType));
  }

  private powerUtilization(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const blueprint = this.buildingByType.get(buildingType);
    const level = this.buildingLevel(planet, buildingType);
    if (!blueprint || level <= 0) {
      return 0;
    }

    const powerPerLevel = blueprint.powerConsumption ?? 0;
    if (powerPerLevel <= 0) {
      return 1;
    }

    const maxConsumption = level * powerPerLevel;
    if (maxConsumption <= 0) {
      return 1;
    }

    return this.currentPowerConsumption(planet, buildingType) / maxConsumption;
  }

  private currentPowerConsumption(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const blueprint = this.buildingByType.get(buildingType);
    const level = this.buildingLevel(planet, buildingType);
    if (!blueprint || level <= 0) {
      return 0;
    }

    const maxConsumption = level * (blueprint.powerConsumption ?? 0);
    if (maxConsumption <= 0) {
      return 0;
    }

    const currentPowerEntry = planet.objects.buildingsCurrentPowerConsumption
      .find((entry) => entry.type === buildingType);
    if (!currentPowerEntry || !Number.isFinite(currentPowerEntry.currentPowerConsumption)) {
      return this.roundNumber(maxConsumption, 2);
    }

    return this.roundNumber(
      Math.max(0, Math.min(maxConsumption, currentPowerEntry.currentPowerConsumption)),
      2
    );
  }

  private isBuildingPowerLimited(planet: ClientPlanetDto, buildingType: BuildingType): boolean {
    const blueprint = this.buildingByType.get(buildingType);
    const level = this.buildingLevel(planet, buildingType);
    if (!blueprint || level <= 0) {
      return false;
    }

    const maxConsumption = level * (blueprint.powerConsumption ?? 0);
    if (maxConsumption <= 0) {
      return false;
    }

    return this.currentPowerConsumption(planet, buildingType) < maxConsumption;
  }

  private hasAnyManualPowerReduction(planet: ClientPlanetDto): boolean {
    for (const entry of planet.objects.buildingsLevels) {
      const buildingType = entry.type as BuildingType;
      if (this.isBuildingPowerLimited(planet, buildingType)) {
        return true;
      }
    }

    return false;
  }

  private resourceCapacity(planet: ClientPlanetDto): { metal: number; crystal: number; deuterium: number } {
    return {
      metal: this.currentBuildingProduction(planet, BuildingType.METAL_STORAGE),
      crystal: this.currentBuildingProduction(planet, BuildingType.CRYSTAL_STORAGE),
      deuterium: this.currentBuildingProduction(planet, BuildingType.DEUTERIUM_TANK)
    };
  }

  private buildingQueueSummary(buildingQueue: BuildingQueueEntryDto[]): string[] {
    return buildingQueue.map((entry) => `${entry.buildingType} L${entry.nextLevel}`);
  }

  private shipyardQueueSummary(shipyardQueue: ShipyardQueueEntryDto[]): string[] {
    return shipyardQueue.map((entry) => `${entry.shipType} x${entry.amount}`);
  }

  private researchSummary(planet: ClientPlanetDto): string {
    if (planet.objects.currentResearchQueue) {
      const entry = planet.objects.currentResearchQueue;
      return `Researching ${entry.technologyType} L${entry.nextLevel}`;
    }

    if (planet.objects.researchHelperFor) {
      return `Helping ${planet.objects.researchHelperFor.technologyType}`;
    }

    return 'Idle';
  }

  private extractGlobalTechLevels(planets: ClientPlanetDto[]): Map<TechnologyType, number> {
    const techLevels = new Map<TechnologyType, number>();

    for (const planet of planets) {
      for (const techEntry of planet.reportData?.techLevels ?? []) {
        const previous = techLevels.get(techEntry.type) ?? 0;
        techLevels.set(techEntry.type, Math.max(previous, techEntry.level));
      }
    }

    return techLevels;
  }

  private buildingLevel(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const entry = planet.objects.buildingsLevels.find((building) => building.type === buildingType);
    return entry?.level ?? 0;
  }

  private comparePlanets(left: ImperiumPlanetVm, right: ImperiumPlanetVm): number {
    if (this.selectedSort === 'name') {
      return left.planet.basicInfo.name.localeCompare(right.planet.basicInfo.name);
    }

    if (this.selectedSort === 'metalIncome') {
      return right.metalIncome - left.metalIncome
        || left.coordinatesLabel.localeCompare(right.coordinatesLabel);
    }

    if (this.selectedSort === 'totalIncome') {
      return right.totalIncome - left.totalIncome
        || left.coordinatesLabel.localeCompare(right.coordinatesLabel);
    }

    if (this.selectedSort === 'industryPower') {
      return right.powers.industryPower - left.powers.industryPower
        || left.coordinatesLabel.localeCompare(right.coordinatesLabel);
    }

    return left.coordinatesLabel.localeCompare(right.coordinatesLabel);
  }

  private matchesFilter(planetVm: ImperiumPlanetVm): boolean {
    if (this.selectedFilter === 'attention') {
      return planetVm.hasAttention;
    }

    if (this.selectedFilter === 'activeQueues') {
      return planetVm.hasActiveQueues;
    }

    if (this.selectedFilter === 'idleQueues') {
      return planetVm.isQueueIdle;
    }

    return true;
  }

  private capacityPercent(current: number, capacity: number): number | null {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      return null;
    }

    return Math.round((current / capacity) * 100);
  }

  private coordinatesLabel(planet: ClientPlanetDto): string {
    return `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}`;
  }

  private roundNumber(value: number, precision: number): number {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
  }
}
