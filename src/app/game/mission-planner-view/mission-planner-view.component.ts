import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { GameStateService } from '../../core/game-state.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { DefenceBlueprintsFactory } from '../../factories/defence-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import {
  bombardmentPriorityLabel,
  BombardmentPriorities,
  BombardmentPrioritySelection,
  BombardmentPriorityTarget,
  emptyBombardmentPriorities,
  normalizeBombardmentPriorities
} from '../../models/bombardment/bombardment-priority';
import { DefenceType } from '../../models/enums/defence-type';
import { FleetMissionType } from '../../models/enums/fleet-mission-type';
import { ShipPurpose } from '../../models/enums/ship-purpose';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import { Defence } from '../../models/defences/defence';
import { countPlanetaryBombs, isPlanetaryBombDefenceType } from '../../models/defences/planetary-bomb';
import { Fleet } from '../../models/fleets/fleet';
import { ManyDefences } from '../../models/defences/many-defences';
import { ManyShips } from '../../models/fleets/many-ships';
import type {
  CreateFleetBombSelectionEntry,
  ClientCoordinates,
  ClientPlanetDto,
  CreateFleetMissionRequest,
  CreateFleetShipSelectionEntry
} from '../../models/game-api-types';
import { Ship } from '../../models/fleets/ship';
import { FleetMissionRegistry } from '../../models/missions/fleet-mission-registry';
import type { MissionPlannerContext } from '../../models/missions/mission-context';
import { calculateRepairCapabilityFromEntries } from '../../models/repairs/ship-repair-capability';
import { maxActiveFleets } from '../../models/tech/technology-effects';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';

type MissionOption = {
  type: FleetMissionType;
  label: string;
  description: string;
};

type ShipSelectionRowVm = {
  type: ShipType;
  label: string;
  purposes: ShipPurpose[];
  available: number;
  availableUndamaged: number;
  availableDamaged: number;
  selected: number;
  selectedUndamaged: number;
  selectedDamaged: number;
  cargoCapacity: number;
  hangarCapacity: number;
  hasWeapons: boolean;
  canJump: boolean;
  isRelevant: boolean;
  isRequired: boolean;
};

type MissionWarningVm = {
  text: string;
  severity: 'error' | 'note';
};

type BombSelectionRowVm = {
  type: DefenceType;
  label: string;
  available: number;
  selected: number;
  size: number;
  hull: number;
  shots: number;
  damage: number;
};

type BombardmentPriorityOptionVm = {
  value: BombardmentPrioritySelection;
  label: string;
};

type BombardmentPriorityGroupVm = {
  label: string;
  options: BombardmentPriorityOptionVm[];
};

const PHASE_ONE_MISSION_TYPES: FleetMissionType[] = [
  FleetMissionType.MOVE,
  FleetMissionType.DEFEND,
  FleetMissionType.TRANSPORT,
  FleetMissionType.SPY,
  FleetMissionType.BOMBARD,
  FleetMissionType.SIEGE,
  FleetMissionType.RECYCLE,
  FleetMissionType.REPAIR,
  FleetMissionType.COLONIZE
];

const MISSION_REGISTRY = FleetMissionRegistry.createDefault();

@Component({
  selector: 'app-mission-planner-view',
  imports: [FormsModule, TopMenuComponent, MiniPlanetPreviewComponent],
  templateUrl: './mission-planner-view.component.html'
})
export class MissionPlannerViewComponent implements OnInit {
  protected readonly shipPurpose = ShipPurpose;
  protected readonly bombardmentPriorityTarget = BombardmentPriorityTarget;
  protected readonly missionOptions: MissionOption[] = MISSION_REGISTRY.supportedMissions(PHASE_ONE_MISSION_TYPES)
    .map((mission) => ({
      type: mission.missionType,
      label: mission.name,
      description: mission.description
    }));

  protected selectedMissionType = FleetMissionType.MOVE;
  protected isLoading = false;
  protected isLaunching = false;
  protected loadError: string | null = null;
  protected launchError: string | null = null;
  protected targetLookupError: string | null = null;
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected activeFleets: Fleet[] = [];
  protected selectedOriginPlanet: ClientPlanetDto | null = null;
  protected selectedTargetPlanet: ClientPlanetDto | null = null;
  protected originCoordinatesInput = '';
  protected targetCoordinatesInput = '';
  protected cargoMetal = 0;
  protected cargoCrystal = 0;
  protected cargoDeuterium = 0;
  protected speedSelectorEnabled = false;
  protected fleetTemplatesEnabled = false;
  protected bombardmentPriorities: BombardmentPriorities = emptyBombardmentPriorities();
  protected readonly bombardmentPriorityGroups: BombardmentPriorityGroupVm[];
  protected readonly purposeFilters = new Map<ShipPurpose, boolean>([
    [ShipPurpose.MILITARY, true],
    [ShipPurpose.BOMBER, true],
    [ShipPurpose.CARGO, true],
    [ShipPurpose.UTILITY, true],
    [ShipPurpose.CARRIER, true],
    [ShipPurpose.RECYCLING, true]
  ]);

  private readonly shipBlueprintsByType = new Map<ShipType, Ship>();
  private readonly bombBlueprintsByType = new Map<DefenceType, Defence>();
  private readonly undamagedShipSelectionByType = new Map<ShipType, number>();
  private readonly damagedShipSelectionByType = new Map<ShipType, number>();
  private readonly bombSelectionByType = new Map<DefenceType, number>();
  private pendingTargetCoordinates: ClientCoordinates | null = null;
  private pendingMissionType: FleetMissionType | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {
    const shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();
    for (const [shipType, ship] of shipBlueprints.shipsMap.entries()) {
      this.shipBlueprintsByType.set(shipType, ship);
      this.undamagedShipSelectionByType.set(shipType, 0);
      this.damagedShipSelectionByType.set(shipType, 0);
    }

    const defenceBlueprints = DefenceBlueprintsFactory.fromDefaultJson();
    for (const [defenceType, defence] of defenceBlueprints.defencesMap.entries()) {
      if (!isPlanetaryBombDefenceType(defenceType)) {
        continue;
      }

      this.bombBlueprintsByType.set(defenceType, defence);
      this.bombSelectionByType.set(defenceType, 0);
    }

    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    const resourceOptions: BombardmentPriorityOptionVm[] = [];
    const facilityOptions: BombardmentPriorityOptionVm[] = [];
    for (const [buildingType, building] of buildingBlueprints.buildingsMap.entries()) {
      const option = {
        value: buildingType,
        label: buildingType
      } satisfies BombardmentPriorityOptionVm;
      if (building.isFacility) {
        facilityOptions.push(option);
      } else {
        resourceOptions.push(option);
      }
    }

    this.bombardmentPriorityGroups = [
      {
        label: 'Categories',
        options: [
          { value: BombardmentPriorityTarget.DEFENCES, label: bombardmentPriorityLabel(BombardmentPriorityTarget.DEFENCES) },
          {
            value: BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT,
            label: bombardmentPriorityLabel(BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT)
          },
          {
            value: BombardmentPriorityTarget.DEFENCES_CANNOT_SHOOT_TO_ORBIT,
            label: bombardmentPriorityLabel(BombardmentPriorityTarget.DEFENCES_CANNOT_SHOOT_TO_ORBIT)
          },
          {
            value: BombardmentPriorityTarget.RESOURCE_BUILDINGS,
            label: bombardmentPriorityLabel(BombardmentPriorityTarget.RESOURCE_BUILDINGS)
          },
          {
            value: BombardmentPriorityTarget.FACILITIES,
            label: bombardmentPriorityLabel(BombardmentPriorityTarget.FACILITIES)
          }
        ]
      },
      {
        label: 'Resource buildings',
        options: resourceOptions.sort((left, right) => left.label.localeCompare(right.label))
      },
      {
        label: 'Facilities',
        options: facilityOptions.sort((left, right) => left.label.localeCompare(right.label))
      }
    ];
  }

  public ngOnInit(): void {
    this.readRoutePrefill();
    this.loadPlannerData();
  }

  protected missionDescription(): string {
    return this.currentMission().description;
  }

  protected missionAllowsCargo(): boolean {
    return this.currentMission().blueprint.shipRules.allowCargo;
  }

  protected planetsWithAvailableShips(): ClientPlanetDto[] {
    return this.ownedPlanets.filter((planet) => this.totalAvailableShips(planet) > 0);
  }

  protected foreignPlanetsWithPlayerShips(): ClientPlanetDto[] {
    return [];
  }

  protected totalAvailableShips(planet: ClientPlanetDto): number {
    // TODO: Distinguish damaged-vs-ready launch availability once fleet readiness is redesigned.
    return ManyShips.totalShipsCount(planet.objects.ships);
  }

  protected totalSelectedShips(): number {
    let total = 0;
    for (const amount of this.undamagedShipSelectionByType.values()) {
      total += amount;
    }
    for (const amount of this.damagedShipSelectionByType.values()) {
      total += amount;
    }

    return total;
  }

  protected selectedShipRows(): ShipSelectionRowVm[] {
    const originPlanet = this.selectedOriginPlanet;
    const availableByType = this.availableShipCounts(originPlanet);
    const availableUndamagedByType = this.availableUndamagedShipCounts(originPlanet);
    const availableDamagedByType = this.availableDamagedShipCounts(originPlanet);
    const rows: ShipSelectionRowVm[] = [];

    for (const [shipType, ship] of this.shipBlueprintsByType.entries()) {
      const selected = this.selectedShipAmount(shipType);
      if (selected <= 0 && !this.matchesPurposeFilter(ship)) {
        continue;
      }

      const available = availableByType.get(shipType) ?? 0;
      const availableUndamaged = availableUndamagedByType.get(shipType) ?? 0;
      const availableDamaged = availableDamagedByType.get(shipType) ?? 0;
      rows.push({
        type: shipType,
        label: ship.getName(),
        purposes: Array.from(ship.purposes.values()),
        available,
        availableUndamaged,
        availableDamaged,
        selected,
        selectedUndamaged: this.selectedUndamagedShipAmount(shipType),
        selectedDamaged: this.selectedDamagedShipAmount(shipType),
        cargoCapacity: ship.cargoCapacity,
        hangarCapacity: ship.hangarCapacity,
        hasWeapons: ship.weapons.length > 0,
        canJump: ship.canJump,
        isRelevant: this.currentMission().isShipRelevant(shipType, ship),
        isRequired: this.currentMission().isShipRequired(shipType)
      });
    }

    return rows;
  }

  protected warningRows(): MissionWarningVm[] {
    const warnings = this.currentMission().getPlannerChecks(this.buildPlannerContext());
    if (this.usedBombHangarCapacity() > this.totalBomberHangarCapacity()) {
      warnings.push({ text: 'Insufficient bomber hangar space for carried bombs.', severity: 'error' });
    }
    if (
      this.selectedMissionType === FleetMissionType.REPAIR
      && (this.selectedRepairCapability().shipRepair + this.selectedRepairCapability().droneRepair) <= 0
    ) {
      warnings.push({ text: 'No repair capacity selected.', severity: 'note' });
    }

    return warnings;
  }

  protected canLaunch(): boolean {
    return !this.isLaunching && this.warningRows().every((warning) => warning.severity !== 'error');
  }

  protected maxActiveFleetCount(): number {
    return maxActiveFleets(this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY));
  }

  protected totalCargoCapacity(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      total += (blueprint?.cargoCapacity ?? 0) * this.selectedShipSelectionAmount(entry);
    }

    return total;
  }

  protected totalHangarCapacity(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (!blueprint || !blueprint.canJump || blueprint.hangarCapacity <= 0) {
        continue;
      }

      total += blueprint.hangarCapacity * this.selectedShipSelectionAmount(entry);
    }

    return total;
  }

  protected totalBomberHangarCapacity(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (
        !blueprint
        || !blueprint.canJump
        || blueprint.hangarCapacity <= 0
        || !blueprint.purposes.has(ShipPurpose.BOMBER)
      ) {
        continue;
      }

      total += blueprint.hangarCapacity * this.selectedShipSelectionAmount(entry);
    }

    return total;
  }

  protected usedCargoCapacity(): number {
    return this.cargoMetal + this.cargoCrystal + this.cargoDeuterium;
  }

  protected remainingCargoCapacity(): number {
    return this.totalCargoCapacity() - this.usedCargoCapacity();
  }

  protected usedHangarCapacity(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (!blueprint || blueprint.canJump || blueprint.size <= 0) {
        continue;
      }

      total += blueprint.size * this.selectedShipSelectionAmount(entry);
    }

    for (const entry of this.selectedBombEntries()) {
      const blueprint = this.bombBlueprintsByType.get(entry.type);
      if (!blueprint) {
        continue;
      }

      total += blueprint.size * entry.amount;
    }

    return total;
  }

  protected usedBombHangarCapacity(): number {
    let total = 0;
    for (const entry of this.selectedBombEntries()) {
      const blueprint = this.bombBlueprintsByType.get(entry.type);
      if (!blueprint) {
        continue;
      }

      total += blueprint.size * entry.amount;
    }

    return total;
  }

  protected totalSelectedBombs(): number {
    return this.selectedBombEntries().reduce((sum, entry) => sum + entry.amount, 0);
  }

  protected supportsBombardmentPriorities(): boolean {
    return this.selectedMissionType === FleetMissionType.BOMBARD || this.selectedMissionType === FleetMissionType.SIEGE;
  }

  protected bombardmentPriorityValue(slot: keyof BombardmentPriorities): BombardmentPrioritySelection | '' {
    return this.bombardmentPriorities[slot] ?? '';
  }

  protected setBombardmentPriority(slot: keyof BombardmentPriorities, value: string): void {
    const normalizedValue = value.trim();
    const nextPriorities = normalizeBombardmentPriorities({
      ...this.bombardmentPriorities,
      [slot]: normalizedValue.length > 0 ? normalizedValue as BombardmentPrioritySelection : null
    });
    this.bombardmentPriorities = nextPriorities;
  }

  protected isBombardmentPriorityOptionDisabled(
    slot: keyof BombardmentPriorities,
    option: BombardmentPrioritySelection
  ): boolean {
    return (['main', 'secondary', 'tertiary'] as const).some((otherSlot) =>
      otherSlot !== slot && this.bombardmentPriorities[otherSlot] === option
    );
  }

  protected selectedBombRows(): BombSelectionRowVm[] {
    const availableByType = this.availableBombCounts(this.selectedOriginPlanet);
    const rows: BombSelectionRowVm[] = [];

    for (const [type, blueprint] of this.bombBlueprintsByType.entries()) {
      const available = availableByType.get(type) ?? 0;
      const selected = this.selectedBombAmount(type);
      if (available <= 0 && selected <= 0) {
        continue;
      }

      const bombWeapon = blueprint.weapons[0];
      rows.push({
        type,
        label: blueprint.getName(),
        available,
        selected,
        size: blueprint.size,
        hull: blueprint.hullPointsCapacity,
        shots: bombWeapon?.shots ?? 0,
        damage: bombWeapon?.dmg ?? 0
      });
    }

    return rows;
  }

  protected shipRepairCapabilityLabel(): string {
    return `${this.selectedRepairCapability().shipRepair}`;
  }

  protected droneRepairCapabilityLabel(): string {
    return `${this.selectedRepairCapability().droneRepair}`;
  }

  protected distancePreview(): number {
    if (!this.selectedOriginPlanet || !this.selectedTargetPlanet) {
      return 0;
    }

    const origin = this.selectedOriginPlanet.coordinates;
    const target = this.selectedTargetPlanet.coordinates;
    return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
  }

  protected travelTurnsPreview(): number {
    return Math.max(1, this.distancePreview());
  }

  protected fuelCostPreview(): number {
    const distance = this.distancePreview();
    const fuelMultiplier = this.currentMission().minimumFuelReserves;
    let totalFuel = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (!blueprint) {
        continue;
      }

      if (!blueprint.canJump) {
        continue;
      }

      totalFuel += blueprint.jumpCost * Math.max(1, distance) * this.selectedShipSelectionAmount(entry);
    }

    return Math.max(0, totalFuel * fuelMultiplier);
  }

  protected onMissionTypeChange(): void {
    this.launchError = null;
    this.normalizeShipSelectionForMission();
  }

  protected purposeFilterEntries(): Array<{ purpose: ShipPurpose; checked: boolean }> {
    return Array.from(this.purposeFilters.entries()).map(([purpose, checked]) => ({ purpose, checked }));
  }

  protected togglePurposeFilter(purpose: ShipPurpose, enabled: boolean): void {
    this.purposeFilters.set(purpose, enabled);
  }

  protected selectMissionType(missionType: FleetMissionType): void {
    this.selectedMissionType = missionType;
    this.onMissionTypeChange();
  }

  protected applyTargetCoordinatesInput(): void {
    const coordinates = this.parseCoordinates(this.targetCoordinatesInput);
    if (!coordinates) {
      this.targetLookupError = 'Target coordinates must have format x:y:z.';
      return;
    }

    this.resolveTargetPlanet(coordinates);
  }

  protected selectOriginPlanet(planet: ClientPlanetDto): void {
    this.selectedOriginPlanet = planet;
    this.originCoordinatesInput = this.coordinatesLabel(planet.coordinates);
    this.launchError = null;
    this.normalizeShipSelectionForMission();
  }

  protected chooseTargetPlanet(planet: ClientPlanetDto): void {
    this.resolveTargetPlanet(planet.coordinates, planet);
  }

  protected selectedOriginMatches(planet: ClientPlanetDto): boolean {
    return this.selectedOriginPlanet ? this.sameCoordinates(this.selectedOriginPlanet.coordinates, planet.coordinates) : false;
  }

  protected selectedTargetMatches(planet: ClientPlanetDto): boolean {
    return this.selectedTargetPlanet ? this.sameCoordinates(this.selectedTargetPlanet.coordinates, planet.coordinates) : false;
  }

  protected selectedShipAmount(shipType: ShipType): number {
    return this.selectedUndamagedShipAmount(shipType) + this.selectedDamagedShipAmount(shipType);
  }

  protected selectedUndamagedShipAmount(shipType: ShipType): number {
    return this.undamagedShipSelectionByType.get(shipType) ?? 0;
  }

  protected selectedDamagedShipAmount(shipType: ShipType): number {
    return this.damagedShipSelectionByType.get(shipType) ?? 0;
  }

  protected maxUndamagedShipAmount(shipType: ShipType): number {
    return this.availableUndamagedShipCounts(this.selectedOriginPlanet).get(shipType) ?? 0;
  }

  protected maxDamagedShipAmount(shipType: ShipType): number {
    return this.availableDamagedShipCounts(this.selectedOriginPlanet).get(shipType) ?? 0;
  }

  protected setUndamagedShipAmount(shipType: ShipType, value: string | number): void {
    const raw = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const capped = Math.min(normalized, this.maxUndamagedShipAmount(shipType));
    this.undamagedShipSelectionByType.set(shipType, capped);
    this.normalizeShipSelectionForMission();
  }

  protected setDamagedShipAmount(shipType: ShipType, value: string | number): void {
    const raw = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const capped = Math.min(normalized, this.maxDamagedShipAmount(shipType));
    this.damagedShipSelectionByType.set(shipType, capped);
    this.normalizeShipSelectionForMission();
  }

  protected fillMaxUndamaged(shipType: ShipType): void {
    this.undamagedShipSelectionByType.set(shipType, this.maxUndamagedShipAmount(shipType));
    this.normalizeShipSelectionForMission();
  }

  protected fillMaxDamaged(shipType: ShipType): void {
    this.damagedShipSelectionByType.set(shipType, this.maxDamagedShipAmount(shipType));
    this.normalizeShipSelectionForMission();
  }

  protected clearUndamagedShip(shipType: ShipType): void {
    this.undamagedShipSelectionByType.set(shipType, 0);
  }

  protected clearDamagedShip(shipType: ShipType): void {
    this.damagedShipSelectionByType.set(shipType, 0);
  }

  protected clearShip(shipType: ShipType): void {
    this.clearUndamagedShip(shipType);
    this.clearDamagedShip(shipType);
  }

  protected clearAllShips(): void {
    for (const shipType of this.shipBlueprintsByType.keys()) {
      this.undamagedShipSelectionByType.set(shipType, 0);
      this.damagedShipSelectionByType.set(shipType, 0);
    }
  }

  protected selectedBombAmount(defenceType: DefenceType): number {
    return this.bombSelectionByType.get(defenceType) ?? 0;
  }

  protected maxBombAmount(defenceType: DefenceType): number {
    const available = this.availableBombCounts(this.selectedOriginPlanet).get(defenceType) ?? 0;
    const blueprint = this.bombBlueprintsByType.get(defenceType);
    if (!blueprint) {
      return 0;
    }

    const usedWithoutThisType = this.usedBombHangarCapacity() - (this.selectedBombAmount(defenceType) * blueprint.size);
    const remainingBomberHangar = Math.max(0, this.totalBomberHangarCapacity() - usedWithoutThisType);
    const hangarLimitedAmount = blueprint.size <= 0
      ? available
      : Math.floor(remainingBomberHangar / blueprint.size);
    return Math.max(0, Math.min(available, hangarLimitedAmount));
  }

  protected setBombAmount(defenceType: DefenceType, value: string | number): void {
    const raw = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const capped = Math.min(normalized, this.maxBombAmount(defenceType));
    this.bombSelectionByType.set(defenceType, capped);
    this.normalizeShipSelectionForMission();
  }

  protected fillMaxBomb(defenceType: DefenceType): void {
    this.bombSelectionByType.set(defenceType, this.maxBombAmount(defenceType));
    this.normalizeShipSelectionForMission();
  }

  protected clearBomb(defenceType: DefenceType): void {
    this.bombSelectionByType.set(defenceType, 0);
    this.normalizeShipSelectionForMission();
  }

  protected clearAllBombs(): void {
    for (const defenceType of this.bombBlueprintsByType.keys()) {
      this.bombSelectionByType.set(defenceType, 0);
    }
  }

  protected launchMission(): void {
    if (!this.canLaunch() || !this.selectedOriginPlanet || !this.selectedTargetPlanet) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.launchError = 'No player session found.';
      return;
    }

    const request: CreateFleetMissionRequest = {
      missionType: this.selectedMissionType,
      origin: this.selectedOriginPlanet.coordinates,
      target: this.selectedTargetPlanet.coordinates,
      ships: this.selectedShipEntries(),
      carriedBombs: this.selectedBombEntries(),
      cargo: {
        metal: this.cargoMetal,
        crystal: this.cargoCrystal,
        deuterium: this.cargoDeuterium
      },
      bombardmentPriorities: this.supportsBombardmentPriorities()
        ? normalizeBombardmentPriorities(this.bombardmentPriorities)
        : null
    };

    this.isLaunching = true;
    this.launchError = null;

    this.gameApi.createFleetMission(request, session.token)
      .pipe(finalize(() => {
        this.isLaunching = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.ownedPlanets = this.sortPlanets(response.ownedPlanets);
          this.activeFleets = [...response.activeFleets];
          this.selectedOriginPlanet = this.findOwnedPlanet(this.selectedOriginPlanet?.coordinates ?? null);
          this.selectedTargetPlanet = this.findOwnedPlanet(this.selectedTargetPlanet?.coordinates ?? null) ?? this.selectedTargetPlanet;
          this.clearAllShips();
          this.clearAllBombs();
          this.cargoMetal = 0;
          this.cargoCrystal = 0;
          this.cargoDeuterium = 0;
        },
        error: (error) => {
          this.launchError = error?.error?.error ?? 'Unable to create fleet mission.';
        }
      });
  }

  private loadPlannerData(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;

    forkJoin({
      ownedPlanets: this.gameApi.getOwnedPlanets(session.token),
      activeFleets: this.gameApi.getActiveFleets(session.token)
    })
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: ({ ownedPlanets, activeFleets }) => {
          this.ownedPlanets = this.sortPlanets(ownedPlanets);
          this.activeFleets = [...activeFleets];
          const firstWithShips = this.planetsWithAvailableShips()[0] ?? this.ownedPlanets[0] ?? null;
          if (firstWithShips) {
            this.selectOriginPlanet(firstWithShips);
          }
          this.applyRoutePrefill();
          this.applyDefaultTargetPlanet();
          this.tutorialService.autoOpenTutorial('missionPlannerView');
        },
        error: () => {
          this.loadError = 'Unable to load mission planner data.';
        }
      });
  }

  private resolveTargetPlanet(coordinates: ClientCoordinates, knownPlanet: ClientPlanetDto | null = null): void {
    if (knownPlanet) {
      this.selectedTargetPlanet = knownPlanet;
      this.targetCoordinatesInput = this.coordinatesLabel(coordinates);
      this.targetLookupError = null;
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.targetLookupError = 'No player session found.';
      return;
    }

    this.targetLookupError = null;
    this.gameApi.getClientPlanet(coordinates.x, coordinates.y, coordinates.z, session.token).subscribe({
      next: (planet) => {
        this.selectedTargetPlanet = planet;
        this.targetCoordinatesInput = this.coordinatesLabel(coordinates);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.targetLookupError = error?.error?.error ?? 'Target planet could not be resolved.';
        this.selectedTargetPlanet = null;
        this.cdr.markForCheck();
      }
    });
  }

  private selectedShipEntries(): CreateFleetShipSelectionEntry[] {
    const entries: CreateFleetShipSelectionEntry[] = [];
    for (const [type] of this.shipBlueprintsByType.entries()) {
      const undamagedAmount = this.selectedUndamagedShipAmount(type);
      const damagedAmount = this.selectedDamagedShipAmount(type);
      if (undamagedAmount <= 0 && damagedAmount <= 0) {
        continue;
      }

      entries.push({ type, undamagedAmount, damagedAmount });
    }

    return entries;
  }

  private selectedBombEntries(): CreateFleetBombSelectionEntry[] {
    const entries: CreateFleetBombSelectionEntry[] = [];
    for (const [type] of this.bombBlueprintsByType.entries()) {
      const amount = this.selectedBombAmount(type);
      if (amount <= 0) {
        continue;
      }

      entries.push({ type, amount });
    }

    return entries;
  }

  private availableShipCounts(planet: ClientPlanetDto | null): Map<ShipType, number> {
    if (!planet) {
      return new Map<ShipType, number>();
    }

    // TODO: Damaged ships still count as fully available for launch in the current mission planner.
    return ManyShips.countByType(planet.objects.ships);
  }

  private availableUndamagedShipCounts(planet: ClientPlanetDto | null): Map<ShipType, number> {
    if (!planet) {
      return new Map<ShipType, number>();
    }

    return ManyShips.undamagedCountByType(planet.objects.ships);
  }

  private availableDamagedShipCounts(planet: ClientPlanetDto | null): Map<ShipType, number> {
    if (!planet) {
      return new Map<ShipType, number>();
    }

    return ManyShips.damagedCountByType(planet.objects.ships);
  }

  private normalizeShipSelectionForMission(): void {
    for (const shipType of this.shipBlueprintsByType.keys()) {
      const maxUndamagedAmount = this.maxUndamagedShipAmount(shipType);
      const currentUndamagedAmount = this.selectedUndamagedShipAmount(shipType);
      if (currentUndamagedAmount > maxUndamagedAmount) {
        this.undamagedShipSelectionByType.set(shipType, maxUndamagedAmount);
      }

      const maxDamagedAmount = this.maxDamagedShipAmount(shipType);
      const currentDamagedAmount = this.selectedDamagedShipAmount(shipType);
      if (currentDamagedAmount > maxDamagedAmount) {
        this.damagedShipSelectionByType.set(shipType, maxDamagedAmount);
      }
    }

    for (const defenceType of this.bombBlueprintsByType.keys()) {
      const maxAmount = this.maxBombAmount(defenceType);
      const currentAmount = this.selectedBombAmount(defenceType);
      if (currentAmount > maxAmount) {
        this.bombSelectionByType.set(defenceType, maxAmount);
      }
    }

    this.applyNormalizedSelection(this.currentMission().normalizeSelection({
      selection: {
        ships: this.selectedShipEntries(),
        carriedBombs: this.selectedBombEntries(),
        cargo: {
          metal: this.cargoMetal,
          crystal: this.cargoCrystal,
          deuterium: this.cargoDeuterium
        }
      }
    }));
  }

  private matchesPurposeFilter(ship: Ship): boolean {
    const enabledPurposes = Array.from(this.purposeFilters.entries())
      .filter(([, enabled]) => enabled)
      .map(([purpose]) => purpose);

    if (enabledPurposes.length === 0) {
      return true;
    }

    return enabledPurposes.some((purpose) => ship.purposes.has(purpose));
  }

  private selectedShipSelectionAmount(entry: CreateFleetShipSelectionEntry): number {
    return entry.undamagedAmount + entry.damagedAmount;
  }

  private availableBombCounts(planet: ClientPlanetDto | null): Map<DefenceType, number> {
    if (!planet) {
      return new Map<DefenceType, number>();
    }

    const counts = new Map<DefenceType, number>();
    for (const [type, amount] of ManyDefences.countByType(planet.objects.defences).entries()) {
      if (!isPlanetaryBombDefenceType(type)) {
        continue;
      }

      counts.set(type, amount);
    }

    return counts;
  }

  private selectedRepairCapability() {
    return calculateRepairCapabilityFromEntries(
      this.selectedShipEntries().map((entry) => [entry.type, this.selectedShipSelectionAmount(entry)] as [ShipType, number])
    );
  }

  private parseCoordinates(value: string): ClientCoordinates | null {
    const trimmed = value.trim();
    const parts = trimmed.split(':').map((part) => Number.parseInt(part.trim(), 10));
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
      return null;
    }

    return {
      x: parts[0],
      y: parts[1],
      z: parts[2]
    };
  }

  private coordinatesLabel(coordinates: ClientCoordinates): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }

  private techLevel(technologyType: TechnologyType): number {
    const techLevels = this.selectedOriginPlanet?.reportData?.techLevels
      ?? this.ownedPlanets[0]?.reportData?.techLevels
      ?? [];
    const matchingEntry = techLevels.find((entry) => entry.type === technologyType);
    return matchingEntry?.level ?? 0;
  }

  private sortPlanets(planets: ClientPlanetDto[]): ClientPlanetDto[] {
    return [...planets].sort((left, right) =>
      left.coordinates.y - right.coordinates.y
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.z - right.coordinates.z
    );
  }

  private sameCoordinates(left: ClientCoordinates, right: ClientCoordinates): boolean {
    return left.x === right.x && left.y === right.y && left.z === right.z;
  }

  private findOwnedPlanet(coordinates: ClientCoordinates | null): ClientPlanetDto | null {
    if (!coordinates) {
      return null;
    }

    return this.ownedPlanets.find((planet) => this.sameCoordinates(planet.coordinates, coordinates)) ?? null;
  }

  private readRoutePrefill(): void {
    const queryParamMap = this.route.snapshot.queryParamMap;
    const mission = queryParamMap.get('mission');
    const targetX = this.parseQueryCoordinate(queryParamMap.get('targetX'));
    const targetY = this.parseQueryCoordinate(queryParamMap.get('targetY'));
    const targetZ = this.parseQueryCoordinate(queryParamMap.get('targetZ'));

    if (mission && this.missionOptions.some((option) => option.type === mission as FleetMissionType)) {
      this.pendingMissionType = mission as FleetMissionType;
      this.selectedMissionType = this.pendingMissionType;
      this.onMissionTypeChange();
    }

    if (targetX !== null && targetY !== null && targetZ !== null) {
      this.pendingTargetCoordinates = { x: targetX, y: targetY, z: targetZ };
      this.targetCoordinatesInput = this.coordinatesLabel(this.pendingTargetCoordinates);
    }
  }

  private applyRoutePrefill(): void {
    if (this.pendingMissionType) {
      this.selectedMissionType = this.pendingMissionType;
      this.onMissionTypeChange();
      this.pendingMissionType = null;
    }

    if (!this.pendingTargetCoordinates) {
      return;
    }

    const targetCoordinates = this.pendingTargetCoordinates;
    this.pendingTargetCoordinates = null;
    this.resolveTargetPlanet(targetCoordinates, this.findOwnedPlanet(targetCoordinates));
  }

  private applyDefaultTargetPlanet(): void {
    if (this.selectedTargetPlanet || !this.selectedOriginPlanet) {
      return;
    }

    const originCoordinates = this.selectedOriginPlanet.coordinates;
    const defaultTarget = this.ownedPlanets.find((planet) =>
      !this.sameCoordinates(planet.coordinates, originCoordinates)
    ) ?? null;

    if (!defaultTarget) {
      return;
    }

    this.chooseTargetPlanet(defaultTarget);
  }

  private parseQueryCoordinate(value: string | null): number | null {
    if (value === null) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  private currentMission() {
    return MISSION_REGISTRY.require(this.selectedMissionType);
  }

  private buildPlannerContext(): MissionPlannerContext {
    const selection = {
      ships: this.selectedShipEntries(),
      carriedBombs: this.selectedBombEntries(),
      cargo: {
        metal: this.cargoMetal,
        crystal: this.cargoCrystal,
        deuterium: this.cargoDeuterium
      }
    };
    const hasMilitaryShips = selection.ships.some((entry) => {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      return blueprint ? blueprint.weapons.length > 0 : false;
    });

    return {
      selection,
      selectedOriginPlanet: this.selectedOriginPlanet,
      selectedTargetPlanet: this.selectedTargetPlanet,
      activeFleetCount: this.activeFleets.length,
      maxActiveFleetCount: this.maxActiveFleetCount(),
      totalSelectedShips: this.totalSelectedShips(),
      totalCargoCapacity: this.totalCargoCapacity(),
      usedCargoCapacity: this.usedCargoCapacity(),
      totalHangarCapacity: this.totalHangarCapacity(),
      usedHangarCapacity: this.usedHangarCapacity(),
      hasMilitaryShips,
      availableDeuterium: this.selectedOriginPlanet?.objects.resources.deuterium ?? null,
      fuelCost: this.fuelCostPreview(),
      diplomacyResolver: this.gameState.diplomacyResolver()
    };
  }

  private applyNormalizedSelection(selection: {
    ships: CreateFleetShipSelectionEntry[];
    carriedBombs: CreateFleetBombSelectionEntry[];
    cargo: { metal: number; crystal: number; deuterium: number };
  }): void {
    this.clearAllShips();
    this.clearAllBombs();
    for (const entry of selection.ships) {
      this.undamagedShipSelectionByType.set(entry.type, Math.max(0, entry.undamagedAmount));
      this.damagedShipSelectionByType.set(entry.type, Math.max(0, entry.damagedAmount));
    }
    for (const entry of selection.carriedBombs ?? []) {
      this.bombSelectionByType.set(entry.type, Math.max(0, entry.amount));
    }

    this.cargoMetal = Math.max(0, selection.cargo.metal);
    this.cargoCrystal = Math.max(0, selection.cargo.crystal);
    this.cargoDeuterium = Math.max(0, selection.cargo.deuterium);
  }
}
