import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { DefenceBlueprintsFactory } from '../../factories/defence-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { DefenceType } from '../../models/enums/defence-type';
import { HullClass } from '../../models/enums/hull-class';
import { ShipPurpose } from '../../models/enums/ship-purpose';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import { Ship } from '../../models/fleets/ship';
import { ManyShips } from '../../models/fleets/many-ships';
import { Weapon } from '../../models/fleets/weapon';
import { Defence } from '../../models/defences/defence';
import { ManyDefences } from '../../models/defences/many-defences';
import { countPlanetaryBombs, isPlanetaryBombDefenceType } from '../../models/defences/planetary-bomb';
import type {
  CancelShipyardQueueEntryRequest,
  ClientPlanetDto,
  ReorderShipyardQueueRequest,
  ShipyardQueueEntryDto,
  StartShipyardConstructionRequest
} from '../../models/game-api-types';
import { energyDeficitEfficiencyMultiplier, energyDeficitPenaltyPercent } from '../../models/planets/energy-deficit';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { industryPowerMultiplier, researchPowerMultiplier } from '../../models/tech/technology-effects';
import { TutorialService } from '../../tutorial/tutorial.service';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import {
  PlanetPowersDisplay,
  ResourceDisplay,
  ResourcesComponent,
  ResourceTitleLink
} from '../ui/resources/resources.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { toRawImagePath } from '../../encyclopedia-menu/encyclopedia-image-paths';
import { PlanetObjectDialogComponent } from '../planet-view/planet-object-dialog.component';
import type {
  PlanetObjectDetailDialogData,
  PlanetObjectDetailRow,
  PlanetObjectDetailSection
} from '../planet-view/planet-object-dialog.component';

type ProductionMode = 'shipyard' | 'defences';
type EnergyState = { used: number; available: number };
type ShipCostRowVm = { label: string; amount: number | null; isEnough: boolean; isPlaceholder: boolean };
type ShipRequirementRowVm = { label: string; isMet: boolean };
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

@Component({
  selector: 'app-production-view',
  imports: [
    TopMenuComponent,
    ResourcesComponent,
    MiniPlanetPreviewComponent,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    PlanetObjectDialogComponent
  ],
  templateUrl: './production-view.component.html',
  styleUrl: './production-view.component.css'
})
export class ProductionViewComponent implements OnInit {
  protected readonly HullClass = HullClass;
  protected readonly shipPurpose = ShipPurpose;
  @Input() public hideTopMenu = false;
  @Input() public forcedMode: ProductionMode | null = null;

  protected readonly modeOptions: Array<{ value: ProductionMode; label: string }> = [
    { value: 'shipyard', label: 'Shipyard' },
    { value: 'defences', label: 'Defences' }
  ];
  protected readonly shipBlueprints: Ship[];
  protected readonly defenceBlueprints: Defence[];

  protected isLoading = false;
  protected loadError: string | null = null;
  protected selectedMode: ProductionMode = 'shipyard';
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected selectedPlanetId: string | null = null;
  protected metalDisplay: ResourceDisplay | null = null;
  protected crystalDisplay: ResourceDisplay | null = null;
  protected deuteriumDisplay: ResourceDisplay | null = null;
  protected energyDisplay: ResourceDisplay | null = null;
  protected energyTooltip: string | null = null;
  protected powersDisplay: PlanetPowersDisplay | null = null;
  protected shipyardQueueActionError: string | null = null;
  protected shipyardQueueMutationInFlight = false;
  protected selectedObjectDetails: PlanetObjectDetailDialogData | null = null;

  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private readonly defenceBlueprintsByType: Map<DefenceType, Defence>;
  private readonly shipBlueprintsByType: Map<ShipType, Ship>;
  private readonly buildingLevelsByType = new Map<BuildingType, number>();
  private readonly buildingCurrentPowerByType = new Map<BuildingType, number>();
  private readonly buildingCurrentStructuralPointsByType = new Map<BuildingType, number>();
  private readonly techLevelsByType = new Map<TechnologyType, number>();
  private readonly shipStartInFlightByType = new Set<ShipType>();
  private readonly shipStartErrorByType = new Map<ShipType, string>();
  private readonly shipAmountInputs = new Map<ShipType, string>();
  private readonly defenceStartInFlightByType = new Set<DefenceType>();
  private readonly defenceStartErrorByType = new Map<DefenceType, string>();
  private readonly defenceAmountInputs = new Map<DefenceType, string>();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {
    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    this.buildingBlueprintsByType = new Map(buildingBlueprints.buildingsMap);

    const defences = DefenceBlueprintsFactory.fromDefaultJson();
    this.defenceBlueprints = Array.from(defences.defencesMap.values());
    this.defenceBlueprintsByType = new Map(defences.defencesMap);

    const shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();
    this.shipBlueprints = Array.from(shipBlueprints.shipsMap.values());
    this.shipBlueprintsByType = new Map(shipBlueprints.shipsMap);
  }

  public ngOnInit(): void {
    if (this.forcedMode) {
      this.selectedMode = this.forcedMode;
    }
    this.loadOwnedPlanets();
  }

  protected currentMode(): ProductionMode {
    return this.forcedMode ?? this.selectedMode;
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

  protected trackShipyardQueueRow(_index: number, row: ShipyardQueueRowVm): string {
    return `${row.queueIndex}:${row.itemKind}:${row.shipType ?? row.defenceType}:${row.amountTotal}`;
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
    const nextPlanetId = this.planetId(planet);
    if (nextPlanetId !== this.selectedPlanetId) {
      this.shipAmountInputs.clear();
      this.defenceAmountInputs.clear();
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

  protected shipPurposeTags(ship: Ship): ShipPurpose[] {
    return Array.from(ship.purposes.values());
  }

  protected currentShipAmount(shipType: ShipType): number {
    return ManyShips.countByType(this.selectedPlanet()?.objects.ships).get(shipType) ?? 0;
  }

  protected currentDefenceAmount(defenceType: DefenceType): number {
    return ManyDefences.countByType(this.selectedPlanet()?.objects.defences).get(defenceType) ?? 0;
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

  protected defenceAmountInput(defenceType: DefenceType): string {
    return this.defenceAmountInputs.get(defenceType) ?? '';
  }

  protected onShipAmountInput(shipType: ShipType, rawValue: unknown): void {
    const normalized = typeof rawValue === 'number' ? String(rawValue) : typeof rawValue === 'string' ? rawValue : '';
    this.shipAmountInputs.set(shipType, normalized);
  }

  protected onDefenceAmountInput(defenceType: DefenceType, rawValue: unknown): void {
    const normalized = typeof rawValue === 'number' ? String(rawValue) : typeof rawValue === 'string' ? rawValue : '';
    this.defenceAmountInputs.set(defenceType, normalized);
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

  protected defenceSingleCostRows(defence: Defence): ShipCostRowVm[] {
    const currentResources = this.selectedPlanet()?.objects.resources;
    return [
      { label: 'M', amount: defence.cost.metal, isEnough: (currentResources?.metal ?? 0) >= defence.cost.metal, isPlaceholder: false },
      { label: 'C', amount: defence.cost.crystal, isEnough: (currentResources?.crystal ?? 0) >= defence.cost.crystal, isPlaceholder: false },
      { label: 'D', amount: defence.cost.deuterium, isEnough: (currentResources?.deuterium ?? 0) >= defence.cost.deuterium, isPlaceholder: false }
    ];
  }

  protected defenceTotalCostRows(defence: Defence): ShipCostRowVm[] {
    const amount = this.defenceAmount(defence.type);
    if (amount === null) {
      return [
        { label: 'M', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'C', amount: null, isEnough: true, isPlaceholder: true },
        { label: 'D', amount: null, isEnough: true, isPlaceholder: true }
      ];
    }

    const total = this.multiplyCost(defence.cost, amount);
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

  protected unmetDefenceRequirementRows(defence: Defence): ShipRequirementRowVm[] {
    return this.defenceRequirementRows(defence).filter((row) => !row.isMet);
  }

  protected unmetDefenceRequirementsLabel(defence: Defence): string | null {
    const unmetRows = this.unmetDefenceRequirementRows(defence);
    if (unmetRows.length === 0) {
      return null;
    }

    return `Requirements ${unmetRows.length}/${this.defenceRequirementRows(defence).length}`;
  }

  protected unmetDefenceRequirementsTooltip(defence: Defence): string | null {
    const unmetRows = this.unmetDefenceRequirementRows(defence);
    if (unmetRows.length === 0) {
      return null;
    }

    return unmetRows.map((row) => row.label).join('\n');
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

  protected defenceRequirementRows(defence: Defence): ShipRequirementRowVm[] {
    const rows: ShipRequirementRowVm[] = [];

      for (const requirement of defence.buildingRequirements) {
        const requiredLevel = Math.ceil(requirement.level);
        const currentLevel = this.buildingLevel(requirement.building);
        rows.push({ label: `${requirement.building}: ${currentLevel}/${requiredLevel}`, isMet: currentLevel >= requiredLevel });
      }

      for (const requirement of defence.techRequirements) {
        const requiredLevel = Math.ceil(requirement.level);
        const currentLevel = this.techLevel(requirement.tech);
        rows.push({ label: `${requirement.tech} (Tech): ${currentLevel}/${requiredLevel}`, isMet: currentLevel >= requiredLevel });
      }

    return rows;
  }

  protected canBuildDefence(defence: Defence): boolean {
    const planet = this.selectedPlanet();
    if (!planet || planet.info.ownerId === null || this.buildingLevel(BuildingType.SHIPYARD) <= 0) {
      return false;
    }
    if (this.defenceStartInFlightByType.has(defence.type) || this.isShipQueueFull()) {
      return false;
    }

    const amount = this.defenceAmount(defence.type);
    if (amount === null || !this.hasEnoughResources(this.multiplyCost(defence.cost, amount))) {
      return false;
    }
    if (!this.hasBuildingRequirements(defence.buildingRequirements, 1) || !this.hasTechRequirements(defence.techRequirements, 1)) {
      return false;
    }

    if (this.wouldExceedBombDepotCapacity(defence.type, amount)) {
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

  protected defenceBuildLabel(defence: Defence): string {
    return this.isHeadDefenceQueueType(defence.type) ? 'Order more' : 'Build';
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

  protected onBuildDefence(defence: Defence): void {
    if (!this.canBuildDefence(defence)) {
      return;
    }

    const planet = this.selectedPlanet();
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
          this.ownedPlanets = this.ownedPlanets.map((entry) =>
            this.planetId(entry) === this.planetId(updatedPlanet) ? updatedPlanet : entry
          );
          this.selectedPlanetId = this.planetId(updatedPlanet);
          this.rebuildSelectedPlanetState();
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.defenceStartErrorByType.set(defence.type, error?.error?.error ?? 'Unable to add defence order to queue.');
          this.cdr.markForCheck();
        }
      });
  }

  protected defenceStartError(defence: Defence): string | null {
    return this.defenceStartErrorByType.get(defence.type) ?? null;
  }

  protected shipStartError(ship: Ship): string | null {
    return this.shipStartErrorByType.get(ship.type) ?? null;
  }

  protected selectedPlanetHasDamagedDefences(): boolean {
    return ManyDefences.hasDamagedDefences(this.selectedPlanet()?.objects.defences);
  }

  protected selectedPlanetDefenceSummary(): string {
    const planet = this.selectedPlanet();
    if (!planet) {
      return 'No planet selected.';
    }

    const total = ManyDefences.totalDefencesCount(planet.objects.defences);
    const damaged = ManyDefences.groupedDamagedEntries(planet.objects.defences)
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (total <= 0) {
      return 'No deployed defences.';
    }

    return `Deployed ${total} | Damaged ${damaged}`;
  }

  protected bombDepotCapacity(): number {
    return Math.max(0, Math.floor(this.currentBuildingProduction(BuildingType.BOMB_DEPOT)));
  }

  protected currentPlanetaryBombCount(): number {
    return countPlanetaryBombs(this.selectedPlanet()?.objects.defences);
  }

  protected queuedPlanetaryBombCount(): number {
    return (this.selectedPlanet()?.objects.shipyardQueue ?? [])
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

    return `Bomb depot storage ${current}/${capacity}${queued > 0 ? ` (+${queued} queued)` : ''}`;
  }

  private createShipDetailDialogData(ship: Ship): PlanetObjectDetailDialogData {
    const counts = this.shipCounts(ship.type);
    const sections: PlanetObjectDetailSection[] = [
      this.createDetailSection('Summary', [
        { label: 'Hull class', value: ship.hullClass },
        { label: 'Purposes', value: this.shipPurposeTags(ship).join(', ') || 'None' },
        { label: 'Size', value: String(ship.size) },
        { label: 'Cargo', value: String(ship.cargoCapacity) },
        { label: 'Hangar', value: String(ship.hangarCapacity) },
        { label: 'Jump capable', value: ship.canJump ? 'Yes' : 'No', tone: ship.canJump ? 'good' : 'muted' },
        { label: 'Jump cost', value: ship.canJump ? String(ship.jumpCost) : 'N/A', tone: ship.canJump ? 'default' : 'muted' }
      ]),
      this.createDetailSection('Current state', [
        { label: 'Owned on planet', value: String(counts.total) },
        { label: 'Undamaged', value: String(counts.undamaged) },
        { label: 'Damaged', value: String(counts.damaged), tone: counts.damaged > 0 ? 'warn' : 'default' },
        { label: 'Missing hull', value: String(counts.missingHull), tone: counts.missingHull > 0 ? 'warn' : 'muted' }
      ]),
      this.createDetailSection('Combat', [
        { label: 'Hull points', value: String(ship.hullPointsCapacity) },
        { label: 'Shield', value: String(ship.shieldCapacity) },
        { label: 'Armor', value: String(ship.armor) },
        { label: 'Critical threshold', value: `${ship.criticalThreshold}%` },
        { label: 'Evasion', value: `${Math.round(ship.evasionChance * 100)}%` }
      ]),
      this.createDetailSection('Weapons', this.detailRowsFromWeapons(ship.weapons)),
      this.createDetailSection('Single ship cost', this.detailRowsFromCostRows(this.shipSingleCostRows(ship))),
      this.createDetailSection('Requirements', this.detailRowsFromRequirementRows(this.shipRequirementRows(ship)))
    ];

    return this.buildObjectDialogData('Ship', ship.type, '', ship.imagePath, sections);
  }

  private createDefenceDetailDialogData(defence: Defence): PlanetObjectDetailDialogData {
    const counts = this.defenceCounts(defence.type);
    const isPlanetaryBomb = defence.hullClass === HullClass.PLANETARY_BOMB || isPlanetaryBombDefenceType(defence.type);
    const stateRows: PlanetObjectDetailRow[] = [
      { label: 'Owned on planet', value: String(counts.total) },
      { label: 'Undamaged', value: String(counts.undamaged) },
      { label: 'Damaged', value: String(counts.damaged), tone: counts.damaged > 0 ? 'warn' : 'default' },
      { label: 'Missing hull', value: String(counts.missingHull), tone: counts.missingHull > 0 ? 'warn' : 'muted' }
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
        { label: 'Hull class', value: defence.hullClass },
        { label: 'Role', value: isPlanetaryBomb ? 'Stored bomb payload' : 'Planetary defence platform' },
        { label: 'Size', value: String(defence.size) },
        { label: 'Can shoot to orbit', value: defence.canShootToOrbit ? 'Yes' : 'No', tone: defence.canShootToOrbit ? 'good' : 'muted' }
      ]),
      this.createDetailSection('Current state', stateRows),
      this.createDetailSection('Combat', [
        { label: 'Hull points', value: String(defence.hullPointsCapacity) },
        { label: 'Shield', value: String(defence.shieldCapacity) },
        { label: 'Armor', value: String(defence.armor) },
        { label: 'Critical threshold', value: `${defence.criticalThreshold}%` }
      ]),
      this.createDetailSection('Weapons', this.detailRowsFromWeapons(defence.weapons)),
      this.createDetailSection('Single defence cost', this.detailRowsFromCostRows(this.defenceSingleCostRows(defence))),
      this.createDetailSection('Requirements', this.detailRowsFromRequirementRows(this.defenceRequirementRows(defence)))
    ];

    return this.buildObjectDialogData('Defence', defence.type, '', defence.imagePath, sections);
  }

  private buildObjectDialogData(
    kindLabel: string,
    title: string,
    description: string,
    imagePath: string,
    sections: PlanetObjectDetailSection[]
  ): PlanetObjectDetailDialogData {
    return {
      kindLabel,
      title,
      subtitle: `${this.selectedPlanetName()} | Production View`,
      description,
      previewImagePath: imagePath,
      rawImagePath: toRawImagePath(imagePath),
      sections
    };
  }

  private createDetailSection(title: string, rows: PlanetObjectDetailRow[]): PlanetObjectDetailSection {
    return { title, rows };
  }

  private detailRowsFromCostRows(rows: ShipCostRowVm[]): PlanetObjectDetailRow[] {
    return rows.map((row) => ({
      label: row.label,
      value: row.amount === null ? '--' : String(row.amount),
      tone: row.isPlaceholder ? 'muted' : row.isEnough ? 'default' : 'bad'
    }));
  }

  private detailRowsFromRequirementRows(rows: ShipRequirementRowVm[]): PlanetObjectDetailRow[] {
    if (rows.length <= 0) {
      return [{ label: 'Requirement', value: 'None', tone: 'muted' }];
    }

      return rows.map((row) => ({
        label: row.label.split(':')[0]?.trim() || row.label,
        value: row.label.includes(':') ? row.label.split(':').slice(1).join(':').trim() : (row.isMet ? 'Met' : 'Missing'),
        tone: row.isMet ? 'good' : 'bad'
      }));
  }

  private detailRowsFromWeapons(weapons: Weapon[]): PlanetObjectDetailRow[] {
    if (weapons.length <= 0) {
      return [{ label: 'Loadout', value: 'None', tone: 'muted' }];
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
    const total = ManyShips.countByType(this.selectedPlanet()?.objects.ships).get(shipType) ?? 0;
    const undamaged = ManyShips.undamagedCountByType(this.selectedPlanet()?.objects.ships).get(shipType) ?? 0;
    const damagedEntry = ManyShips.groupedDamagedEntries(this.selectedPlanet()?.objects.ships)
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
    const total = ManyDefences.countByType(this.selectedPlanet()?.objects.defences).get(defenceType) ?? 0;
    const undamaged = ManyDefences.undamagedCountByType(this.selectedPlanet()?.objects.defences).get(defenceType) ?? 0;
    const damagedEntry = ManyDefences.groupedDamagedEntries(this.selectedPlanet()?.objects.defences)
      .find((entry) => entry.type === defenceType);

    return {
      total,
      undamaged,
      damaged: damagedEntry?.amount ?? 0,
      missingHull: damagedEntry?.totalMissingHull ?? 0
    };
  }

  protected currentShipQueueLength(): number {
    return this.selectedPlanet()?.objects.shipyardQueue?.length ?? 0;
  }

  protected maxShipQueueLength(): number {
    const rawLimit = 1 + Math.sqrt(Math.max(0, this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY) + this.buildingLevel(BuildingType.SHIPYARD)));
    return Math.max(1, Math.floor(rawLimit));
  }

  protected hasShipyardQueueEntries(): boolean {
    return (this.selectedPlanet()?.objects.shipyardQueue?.length ?? 0) > 0;
  }

  protected shipyardQueueRows(): ShipyardQueueRowVm[] {
    const queueEntries = this.selectedPlanet()?.objects.shipyardQueue ?? [];
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
      if (itemKind === 'defence') {
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
        return;
      }

      const shipType = this.queueEntryShipType(entry);
      const singleShipBaseConstructionTime = this.baseShipConstructionTime(shipType, 1);
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
        estimatedTurnsForCompletion: shipyardPower > 0 ? Math.ceil(cumulativeRemaining / shipyardPower) : null,
        isHeadOfQueue: index === 0
      });
    });

    return rows;
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

  protected shipyardQueueDropListId(): string {
    return `shipyard-queue:${this.selectedPlanetId ?? 'none'}`;
  }

  protected isShipyardQueueInteractionDisabled(): boolean {
    return this.shipyardQueueMutationInFlight;
  }

  protected onShipyardQueueDrop(event: CdkDragDrop<ShipyardQueueRowVm[]>): void {
    if (event.previousIndex === event.currentIndex || this.shipyardQueueMutationInFlight) {
      return;
    }

    const rows = this.shipyardQueueRows();
    const movedRow = rows[event.previousIndex];
    const targetRow = rows[event.currentIndex];
    const planet = this.selectedPlanet();
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
          this.applyUpdatedPlanet(updatedPlanet);
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

    const planet = this.selectedPlanet();
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
          this.applyUpdatedPlanet(updatedPlanet);
        },
        error: (error: { error?: { error?: string } }) => {
          this.shipyardQueueActionError = error?.error?.error ?? 'Unable to cancel shipyard queue entry.';
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
          if (!this.forcedMode) {
            this.tutorialService.autoOpenTutorial('productionView');
          }
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
    this.techLevelsByType.clear();
    this.shipStartInFlightByType.clear();
    this.shipStartErrorByType.clear();
    this.defenceStartInFlightByType.clear();
    this.defenceStartErrorByType.clear();
    this.shipyardQueueActionError = null;
    this.shipyardQueueMutationInFlight = false;

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
      this.buildingCurrentPowerByType.set(entry.type as BuildingType, this.roundNumber(Math.max(0, entry.currentPowerConsumption), 2));
    }
    for (const entry of planet.objects.buildingsCurrentStructuralPoints ?? []) {
      this.buildingCurrentStructuralPointsByType.set(entry.type as BuildingType, Math.max(0, Math.floor(entry.currentStructuralPoints)));
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

    this.metalDisplay = {
      current: resources.metal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.METAL_MINE, adaptiveTechLevel, planet.info.planetaryParameters.metalModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.metal, this.storageCapacity(BuildingType.METAL_STORAGE))
    };
    this.crystalDisplay = {
      current: resources.crystal,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.CRYSTAL_MINE, adaptiveTechLevel, planet.info.planetaryParameters.crystalModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.crystal, this.storageCapacity(BuildingType.CRYSTAL_STORAGE))
    };
    this.deuteriumDisplay = {
      current: resources.deuterium,
      productionPerTurn: this.roundNumber(this.resourceGain(BuildingType.DEUTERIUM_SYNTHESIZER, adaptiveTechLevel, planet.info.planetaryParameters.deuteriumModifier) * energyEfficiency, 2),
      capacityPercent: this.capacityPercent(resources.deuterium, this.storageCapacity(BuildingType.DEUTERIUM_TANK))
    };

    this.energyDisplay = { used: energy.used, available: energy.available };
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
    const adaptiveTechnologyLevel = this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const industryModifier = this.selectedPlanet()?.info.planetaryParameters.industryModifier ?? 1;
    const roboticsFactoryLevel = this.buildingLevel(BuildingType.ROBOTICS_FACTORY);
    const naniteFactoryLevel = this.buildingLevel(BuildingType.NANITE_FACTORY);
    const roboticsPower = roboticsFactoryLevel <= 0 ? 5 : this.getProductionAtLevelByType(BuildingType.ROBOTICS_FACTORY, roboticsFactoryLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0 ? 1 : this.getProductionAtLevelByTypeExact(BuildingType.NANITE_FACTORY, naniteFactoryLevel);
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
    const shipyardBasePower = shipyardLevel <= 0 ? 0 : this.getProductionAtLevelByType(BuildingType.SHIPYARD, shipyardLevel);
    const naniteMultiplier = naniteFactoryLevel <= 0 ? 1 : this.getProductionAtLevelByTypeExact(BuildingType.NANITE_FACTORY, naniteFactoryLevel);
    const shipyardPower = shipyardBasePower
      * naniteMultiplier
      * industryModifier
      * industryPowerMultiplier(adaptiveTechnologyLevel);
    return !Number.isFinite(shipyardPower) || shipyardPower <= 0 ? 0 : Math.floor(shipyardPower * this.currentEnergyEfficiency());
  }

  private currentResearchPower(): number {
    const scienceModifier = this.selectedPlanet()?.info.planetaryParameters.scienceModifier ?? 1;
    const researchLabLevel = this.buildingLevel(BuildingType.RESEARCH_LAB);
    const researchLabProduction = this.getProductionAtLevelByType(BuildingType.RESEARCH_LAB, researchLabLevel);
    const totalResearchMultiplier = researchPowerMultiplier(
      this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY),
      this.techLevel(TechnologyType.ADAPTIVE_TECHNOLOGY),
      this.techLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK)
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

  private shipRequirementRows(ship: Ship): ShipRequirementRowVm[] {
    const rows: ShipRequirementRowVm[] = [];

    for (const requirement of ship.buildingRequirements) {
      const requiredLevel = Math.ceil(requirement.level);
      const currentLevel = this.buildingLevel(requirement.building);
      rows.push({ label: `${requirement.building}: ${currentLevel}/${requiredLevel}`, isMet: currentLevel >= requiredLevel });
    }
    for (const requirement of ship.techRequirements) {
      const requiredLevel = Math.ceil(requirement.level);
      const currentLevel = this.techLevel(requirement.tech);
      rows.push({ label: `${requirement.tech} (Tech): ${currentLevel}/${requiredLevel}`, isMet: currentLevel >= requiredLevel });
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

  private defenceAmount(defenceType: DefenceType): number | null {
    const raw = (this.defenceAmountInputs.get(defenceType) ?? '').trim();
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
    return !!firstQueueEntry
      && this.queueEntryItemKind(firstQueueEntry) === 'ship'
      && this.queueEntryShipType(firstQueueEntry) === shipType;
  }

  private isHeadDefenceQueueType(defenceType: DefenceType): boolean {
    const firstQueueEntry = this.selectedPlanet()?.objects.shipyardQueue?.[0];
    return !!firstQueueEntry
      && this.queueEntryItemKind(firstQueueEntry) === 'defence'
      && this.queueEntryDefenceType(firstQueueEntry) === defenceType;
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
    return Number.isInteger(amount) && amount >= 1 ? amount : 1;
  }

  private queueEntryInvestedShipyardPower(entry: ShipyardQueueEntryDto): number {
    const invested = Number((entry as { investedShipyardPower?: unknown }).investedShipyardPower);
    return !Number.isFinite(invested) || invested < 0 ? 0 : Math.floor(invested);
  }

  private queueEntryBaseConstructionTime(entry: ShipyardQueueEntryDto): number {
    const amount = this.queueEntryShipAmount(entry);
    if (this.queueEntryItemKind(entry) === 'defence') {
      return this.baseDefenceConstructionTime(this.queueEntryDefenceType(entry), amount);
    }

    return this.baseShipConstructionTime(this.queueEntryShipType(entry), amount);
  }

  private baseShipConstructionTime(shipType: ShipType, amount: number): number {
    const blueprint = this.shipBlueprintsByType.get(shipType);
    if (!blueprint || amount < 1) {
      return 0;
    }

    return Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()) * amount);
  }

  private baseDefenceConstructionTime(defenceType: DefenceType, amount: number): number {
    const blueprint = this.defenceBlueprintsByType.get(defenceType);
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

  private defenceAmountCompleted(defenceType: DefenceType, amount: number, investedShipyardPower: number): number {
    const blueprint = this.defenceBlueprintsByType.get(defenceType);
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

  private getProductionAtLevelByTypeExact(buildingType: BuildingType, level: number): number {
    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    return blueprint ? this.getProductionAtLevelExact(blueprint, level) : 0;
  }

  private getProductionAtLevel(building: Building, level: number): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    return Math.floor(
      baseProduction
      * this.powerUtilizationAtLevel(building.type, level, building.powerConsumption ?? 0)
      * this.structuralUtilizationAtLevel(building.type, level)
    );
  }

  private getProductionAtLevelExact(building: Building, level: number): number {
    const baseProduction = this.getRawProductionAtLevel(building, level);
    if (baseProduction <= 0) {
      return 0;
    }

    return baseProduction
      * this.powerUtilizationAtLevel(building.type, level, building.powerConsumption ?? 0)
      * this.structuralUtilizationAtLevel(building.type, level);
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

  private maxBuildingStructuralPoints(buildingType: BuildingType, level: number): number {
    if (level <= 0) {
      return 0;
    }

    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    const multiplier = 2 ** Math.max(0, level - 1);
    const metalCost = blueprint.basicCost.metal * multiplier;
    const crystalCost = blueprint.basicCost.crystal * multiplier;
    const deuteriumCost = blueprint.basicCost.deuterium * multiplier;
    return Math.max(0, Math.floor((metalCost * 2) + crystalCost + Math.floor(deuteriumCost * 0.5)));
  }

  private minimumStructuralUtilization(buildingType: BuildingType): number {
    if (
      buildingType === BuildingType.JUMP_GATE
      || buildingType === BuildingType.SENSOR_PHALANX
      || buildingType === BuildingType.BOMB_DEPOT
    ) {
      return 0;
    }

    return Math.min(1, 0.02 + (this.buildingLevel(BuildingType.BUNKER_NETWORK) * 0.01));
  }

  private wouldExceedBombDepotCapacity(defenceType: DefenceType, requestedAmount: number): boolean {
    if (!isPlanetaryBombDefenceType(defenceType)) {
      return false;
    }

    return this.currentPlanetaryBombCount() + this.queuedPlanetaryBombCount() + requestedAmount > this.bombDepotCapacity();
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
