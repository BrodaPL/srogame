import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { FleetMissionType } from '../../models/enums/fleet-mission-type';
import { ShipPurpose } from '../../models/enums/ship-purpose';
import { ShipType } from '../../models/enums/ship-type';
import { TechnologyType } from '../../models/enums/technology-type';
import { WeaponType } from '../../models/enums/weapon-type';
import { Fleet } from '../../models/fleets/fleet';
import { ManyShips } from '../../models/fleets/many-ships';
import type {
  ClientCoordinates,
  ClientPlanetDto,
  CreateFleetMissionRequest,
  ShipAmountEntry
} from '../../models/game-api-types';
import { Ship } from '../../models/fleets/ship';
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
  selected: number;
  cargoCapacity: number;
  hangarCapacity: number;
  hasWeapons: boolean;
  isRelevant: boolean;
  isRequired: boolean;
};

type MissionWarningVm = {
  text: string;
  severity: 'error' | 'note';
};

@Component({
  selector: 'app-mission-planner-view',
  imports: [FormsModule, TopMenuComponent, MiniPlanetPreviewComponent],
  templateUrl: './mission-planner-view.component.html'
})
export class MissionPlannerViewComponent implements OnInit {
  protected readonly shipPurpose = ShipPurpose;
  protected readonly missionOptions: MissionOption[] = [
    {
      type: FleetMissionType.MOVE,
      label: 'Move',
      description: 'Relocate ships to your own planets or park them above unowned planets. Cargo is allowed.'
    },
    {
      type: FleetMissionType.TRANSPORT,
      label: 'Transport',
      description: 'Send resources and ships to one of your own planets, then return automatically.'
    },
    {
      type: FleetMissionType.SPY,
      label: 'Spy',
      description: 'Send only Spy Probes. No cargo is allowed.'
    },
    {
      type: FleetMissionType.COLONIZE,
      label: 'Colonize',
      description: 'Send a Colonizer to an unowned planet.'
    }
  ];

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
  protected readonly purposeFilters = new Map<ShipPurpose, boolean>([
    [ShipPurpose.MILITARY, true],
    [ShipPurpose.CARGO, true],
    [ShipPurpose.UTILITY, true],
    [ShipPurpose.CARRIER, true]
  ]);

  private readonly shipBlueprintsByType = new Map<ShipType, Ship>();
  private readonly shipSelectionByType = new Map<ShipType, number>();
  private pendingTargetCoordinates: ClientCoordinates | null = null;
  private pendingMissionType: FleetMissionType | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {
    const shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();
    for (const [shipType, ship] of shipBlueprints.shipsMap.entries()) {
      this.shipBlueprintsByType.set(shipType, ship);
      this.shipSelectionByType.set(shipType, 0);
    }
  }

  public ngOnInit(): void {
    this.readRoutePrefill();
    this.loadPlannerData();
  }

  protected missionDescription(): string {
    return this.missionOptions.find((option) => option.type === this.selectedMissionType)?.description
      ?? '';
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
    for (const amount of this.shipSelectionByType.values()) {
      total += amount;
    }

    return total;
  }

  protected selectedShipRows(): ShipSelectionRowVm[] {
    const originPlanet = this.selectedOriginPlanet;
    const availableByType = this.availableShipCounts(originPlanet);
    const rows: ShipSelectionRowVm[] = [];

    for (const [shipType, ship] of this.shipBlueprintsByType.entries()) {
      const selected = this.selectedShipAmount(shipType);
      if (selected <= 0 && !this.matchesPurposeFilter(ship)) {
        continue;
      }

      const available = availableByType.get(shipType) ?? 0;
      rows.push({
        type: shipType,
        label: ship.getName(),
        purposes: Array.from(ship.purposes.values()),
        available,
        selected,
        cargoCapacity: ship.cargoCapacity,
        hangarCapacity: ship.hangarCapacity,
        hasWeapons: ship.weapons.length > 0,
        isRelevant: this.isShipRelevantForMission(shipType, ship),
        isRequired: this.isShipRequiredForMission(shipType)
      });
    }

    return rows;
  }

  protected warningRows(): MissionWarningVm[] {
    const warnings: MissionWarningVm[] = [];
    const originPlanet = this.selectedOriginPlanet;
    const targetPlanet = this.selectedTargetPlanet;
    const cargoUsed = this.usedCargoCapacity();
    const cargoCapacity = this.totalCargoCapacity();
    const selectedShips = this.selectedShipEntries();
    const hasMilitaryShips = selectedShips.some((entry) => {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      return blueprint ? blueprint.weapons.length > 0 : false;
    });
    const totalHangarCapacity = this.totalHangarCapacity();

    if (!originPlanet) {
      warnings.push({ text: 'Select origin planet.', severity: 'error' });
    }

    if (!targetPlanet) {
      warnings.push({ text: 'Select or resolve target planet.', severity: 'error' });
    }

    if (this.totalSelectedShips() <= 0) {
      warnings.push({ text: 'Select at least one ship.', severity: 'error' });
    }

    if (cargoUsed > cargoCapacity) {
      warnings.push({ text: 'Insufficient cargo space.', severity: 'error' });
    }

    if (this.activeFleets.length >= this.maxActiveFleetCount()) {
      warnings.push({
        text: `Active fleet limit reached (${this.activeFleets.length}/${this.maxActiveFleetCount()}). Upgrade COMPUTER_TECHNOLOGY to control more fleets.`,
        severity: 'error'
      });
    }

    if (this.selectedMissionType === FleetMissionType.SPY) {
      const spyProbeAmount = this.selectedShipAmount(ShipType.SPY_PROBE);
      if (spyProbeAmount <= 0) {
        warnings.push({ text: 'No espionage probes selected.', severity: 'error' });
      }

      const nonProbeSelection = selectedShips.some((entry) => entry.type !== ShipType.SPY_PROBE);
      if (nonProbeSelection) {
        warnings.push({ text: 'Spy mission accepts only Spy Probes.', severity: 'error' });
      }

      if (targetPlanet && this.isOwnedByPlayer(targetPlanet)) {
        warnings.push({ text: 'Target is your own planet.', severity: 'error' });
      }

      if (cargoUsed > 0) {
        warnings.push({ text: 'Spy mission cannot carry cargo.', severity: 'error' });
      }
    }

    if (this.selectedMissionType === FleetMissionType.COLONIZE) {
      if (this.selectedShipAmount(ShipType.COLONIZER) <= 0) {
        warnings.push({ text: 'No colony ship selected.', severity: 'error' });
      }

      if (targetPlanet && targetPlanet.info.ownerId !== null) {
        warnings.push({ text: 'Target planet is already occupied.', severity: 'error' });
      }
    }

    if (this.selectedMissionType === FleetMissionType.MOVE) {
      if (targetPlanet && targetPlanet.info.ownerId !== null && !this.isOwnedByPlayer(targetPlanet)) {
        warnings.push({ text: 'Move mission target must be one of your planets or an unowned planet.', severity: 'error' });
      }
    }

    if (this.selectedMissionType === FleetMissionType.TRANSPORT && cargoUsed <= 0) {
      warnings.push({ text: 'Transport mission requires cargo.', severity: 'error' });
    }

    if (this.selectedMissionType === FleetMissionType.TRANSPORT) {
      if (targetPlanet && !this.isOwnedByPlayer(targetPlanet)) {
        warnings.push({ text: 'Transport mission target must be one of your planets.', severity: 'error' });
      }
    }

    if (this.selectedMissionType !== FleetMissionType.SPY && !hasMilitaryShips) {
      warnings.push({ text: 'No military ships selected.', severity: 'note' });
    }

    if (totalHangarCapacity > 0) {
      warnings.push({
        text: `Hangar capacity remaining: ${totalHangarCapacity} (not used in phase 1).`,
        severity: 'note'
      });
    }

    if (this.selectedShipAmount(ShipType.REPAIR_DRONE) <= 0) {
      warnings.push({ text: 'No repair capacity selected.', severity: 'note' });
    }

    const fuelCost = this.fuelCostPreview();
    if (originPlanet) {
      const availableDeuterium = originPlanet.objects.resources.deuterium;
      if (availableDeuterium < (this.cargoDeuterium + fuelCost)) {
        warnings.push({ text: 'Insufficient deuterium for cargo and fuel.', severity: 'error' });
      }
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
      total += (blueprint?.cargoCapacity ?? 0) * entry.amount;
    }

    return total;
  }

  protected totalHangarCapacity(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      total += (blueprint?.hangarCapacity ?? 0) * entry.amount;
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
    return 0;
  }

  protected repairSummaryLabel(): string {
    return `${this.totalRepairPower()}|${this.totalRepairEquipmentCount()}x`;
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
    const fuelMultiplier = this.selectedMissionType === FleetMissionType.SPY ? 1 : 2;
    let totalFuel = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (!blueprint) {
        continue;
      }

      totalFuel += blueprint.jumpCost * Math.max(1, distance) * entry.amount;
    }

    return Math.max(0, totalFuel * fuelMultiplier);
  }

  protected totalRepairPower(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (!blueprint) {
        continue;
      }

      for (const weapon of blueprint.weapons) {
        if (weapon.type !== WeaponType.REPAIR_EQIPMENT) {
          continue;
        }

        total += weapon.dmg * weapon.shots * entry.amount;
      }
    }

    return total;
  }

  protected totalRepairEquipmentCount(): number {
    let total = 0;
    for (const entry of this.selectedShipEntries()) {
      const blueprint = this.shipBlueprintsByType.get(entry.type);
      if (!blueprint) {
        continue;
      }

      for (const weapon of blueprint.weapons) {
        if (weapon.type !== WeaponType.REPAIR_EQIPMENT) {
          continue;
        }

        total += weapon.shots * entry.amount;
      }
    }

    return total;
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
    return this.shipSelectionByType.get(shipType) ?? 0;
  }

  protected maxShipAmount(shipType: ShipType): number {
    return this.availableShipCounts(this.selectedOriginPlanet).get(shipType) ?? 0;
  }

  protected setShipAmount(shipType: ShipType, value: string | number): void {
    const raw = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const capped = Math.min(normalized, this.maxShipAmount(shipType));
    this.shipSelectionByType.set(shipType, capped);
    this.normalizeShipSelectionForMission();
  }

  protected fillMax(shipType: ShipType): void {
    this.shipSelectionByType.set(shipType, this.maxShipAmount(shipType));
    this.normalizeShipSelectionForMission();
  }

  protected clearShip(shipType: ShipType): void {
    this.shipSelectionByType.set(shipType, 0);
  }

  protected clearAllShips(): void {
    for (const shipType of this.shipSelectionByType.keys()) {
      this.shipSelectionByType.set(shipType, 0);
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
      cargo: {
        metal: this.cargoMetal,
        crystal: this.cargoCrystal,
        deuterium: this.cargoDeuterium
      }
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

  private selectedShipEntries(): ShipAmountEntry[] {
    const entries: ShipAmountEntry[] = [];
    for (const [type, amount] of this.shipSelectionByType.entries()) {
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

  private normalizeShipSelectionForMission(): void {
    for (const shipType of this.shipSelectionByType.keys()) {
      const maxAmount = this.maxShipAmount(shipType);
      const current = this.selectedShipAmount(shipType);
      if (current > maxAmount) {
        this.shipSelectionByType.set(shipType, maxAmount);
      }
    }

    if (this.selectedMissionType === FleetMissionType.SPY) {
      for (const shipType of this.shipSelectionByType.keys()) {
        if (shipType !== ShipType.SPY_PROBE) {
          this.shipSelectionByType.set(shipType, 0);
        }
      }

      this.cargoMetal = 0;
      this.cargoCrystal = 0;
      this.cargoDeuterium = 0;
    }
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

  private isShipRelevantForMission(shipType: ShipType, ship: Ship): boolean {
    if (this.selectedMissionType === FleetMissionType.SPY) {
      return shipType === ShipType.SPY_PROBE;
    }

    if (this.selectedMissionType === FleetMissionType.COLONIZE) {
      return shipType === ShipType.COLONIZER || ship.cargoCapacity > 0;
    }

    if (this.selectedMissionType === FleetMissionType.TRANSPORT) {
      return ship.cargoCapacity > 0;
    }

    return true;
  }

  private isShipRequiredForMission(shipType: ShipType): boolean {
    if (this.selectedMissionType === FleetMissionType.SPY) {
      return shipType === ShipType.SPY_PROBE;
    }

    if (this.selectedMissionType === FleetMissionType.COLONIZE) {
      return shipType === ShipType.COLONIZER;
    }

    return false;
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

  private isOwnedByPlayer(planet: ClientPlanetDto): boolean {
    const playerOwnerId = this.selectedOriginPlanet?.info.ownerId ?? this.ownedPlanets[0]?.info.ownerId ?? null;
    return playerOwnerId !== null && planet.info.ownerId === playerOwnerId;
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

  private parseQueryCoordinate(value: string | null): number | null {
    if (value === null) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }
}
