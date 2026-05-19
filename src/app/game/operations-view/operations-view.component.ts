import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { GameStateService } from '../../core/game-state.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import {
  ClientPlanetDto,
  CreateMaintenanceRequestResponse,
  FleetMaintenanceBombOptionDto,
  FleetMaintenanceOptionsDto,
  FleetMaintenanceShipOptionDto,
  MaintenanceTransferPayloadDto
} from '../../models/game-api-types';
import { DiplomaticStatus } from '../../models/diplomacy/diplomatic-status';
import { FleetMissionType } from '../../models/enums/fleet-mission-type';
import { TechnologyType } from '../../models/enums/technology-type';
import { WeaponType } from '../../models/enums/weapon-type';
import { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } from '../../models/fleets/fleet';
import { ManyShips } from '../../models/fleets/many-ships';
import { calculateRepairCapabilityForManyShips } from '../../models/repairs/ship-repair-capability';
import { calculateRecycleCapabilityForManyShips } from '../../models/recycling/recycling-capability';
import { maxActiveFleets } from '../../models/tech/technology-effects';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

type CoordinateSegmentVm = {
  coordinates: { x: number; y: number; z: number };
  ownerName: string | null;
  relation: string;
};

@Component({
  selector: 'app-operations-view',
  imports: [TopMenuComponent, RouterLink, FormsModule],
  templateUrl: './operations-view.component.html',
  styleUrl: './operations-view.styles.css'
})
export class OperationsViewComponent implements OnInit {
  protected readonly fleetState = FleetState;
  protected readonly fleetOrbitActivity = FleetOrbitActivity;
  protected readonly fleetReturnReason = FleetReturnReason;
  protected readonly fleetMissionType = FleetMissionType;
  protected isLoading = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected actionSuccess: string | null = null;
  protected activeFleets: Fleet[] = [];
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected activeActionFleetId: number | null = null;
  protected maintenanceDialogFleetId: number | null = null;
  protected maintenanceOptions: FleetMaintenanceOptionsDto | null = null;
  protected maintenanceDialogError: string | null = null;
  protected maintenanceDialogLoading = false;
  protected maintenanceSubmitting = false;
  protected requestedFuel = 0;
  protected requestedShipAmounts: Partial<Record<string, number>> = {};
  protected requestedBombAmounts: Partial<Record<string, number>> = {};
  private readonly ownerInfoByCoordinates = new Map<string, { ownerId: number | null; ownerName: string | null }>();

  private readonly shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService,
    private readonly router: Router
  ) {}

  public ngOnInit(): void {
    this.loadActiveFleets();
  }

  protected totalShips(fleet: Fleet): number {
    return ManyShips.totalShipsCount(fleet.ships);
  }

  protected primaryFleet(): Fleet | null {
    return this.activeFleets[0] ?? null;
  }

  protected activeFleetCountLabel(): string {
    return `${this.activeFleets.length}/${this.maxActiveFleetCount()}`;
  }

  protected shipSummary(fleet: Fleet): string {
    return [...ManyShips.countByType(fleet.ships).entries()]
      .sort(([leftType], [rightType]) => leftType.localeCompare(rightType))
      .map(([type, amount]) => `${type} x${amount}`)
      .join(', ');
  }

  protected coordinatesLabel(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
  }

  protected currentLocationPlanetName(fleet: Fleet): string {
    if (fleet.state === FleetState.PENDING_JUMP_GATE) {
      return fleet.originPlanetName;
    }

    if (this.isRecalledInTransit(fleet)) {
      return 'Recalled in transit';
    }

    return this.usesOriginCoordinates(fleet.state) ? fleet.originPlanetName : fleet.targetPlanetName;
  }

  protected currentLocationCoordinates(fleet: Fleet): string {
    if (fleet.state === FleetState.PENDING_JUMP_GATE) {
      return this.coordinatesWithOwnerLabel(fleet.origin);
    }

    if (this.isRecalledInTransit(fleet)) {
      return `${this.coordinatesWithOwnerLabel(fleet.origin)} -> ${this.coordinatesWithOwnerLabel(fleet.target)}`;
    }

    const coordinates = this.usesOriginCoordinates(fleet.state) ? fleet.origin : fleet.target;
    return this.coordinatesWithOwnerLabel(coordinates);
  }

  protected currentLocationRelation(fleet: Fleet): string {
    if (fleet.state === FleetState.PENDING_JUMP_GATE) {
      return this.coordinatesRelation(fleet.origin);
    }

    if (this.isRecalledInTransit(fleet)) {
      return this.coordinatesRelation(fleet.target);
    }

    const coordinates = this.usesOriginCoordinates(fleet.state) ? fleet.origin : fleet.target;
    return this.coordinatesRelation(coordinates);
  }

  protected currentLocationSegments(fleet: Fleet): CoordinateSegmentVm[] {
    if (fleet.state === FleetState.PENDING_JUMP_GATE) {
      return [this.toCoordinateSegment(fleet.origin)];
    }

    if (this.isRecalledInTransit(fleet)) {
      return [
        this.toCoordinateSegment(fleet.origin),
        this.toCoordinateSegment(fleet.target)
      ];
    }

    const coordinates = this.usesOriginCoordinates(fleet.state) ? fleet.origin : fleet.target;
    return [this.toCoordinateSegment(coordinates)];
  }

  protected destinationPlanetName(fleet: Fleet): string {
    switch (fleet.state) {
      case FleetState.PENDING_JUMP_GATE:
        return fleet.targetPlanetName;
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return fleet.originPlanetName;
      case FleetState.ORBITING:
        return 'Holding position';
      default:
        return fleet.targetPlanetName;
    }
  }

  protected destinationCoordinates(fleet: Fleet): string {
    switch (fleet.state) {
      case FleetState.PENDING_JUMP_GATE:
        return this.coordinatesWithOwnerLabel(fleet.target);
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return this.coordinatesWithOwnerLabel(fleet.origin);
      case FleetState.ORBITING:
        return this.currentLocationCoordinates(fleet);
      default:
        return this.coordinatesWithOwnerLabel(fleet.target);
    }
  }

  protected destinationRelation(fleet: Fleet): string {
    switch (fleet.state) {
      case FleetState.PENDING_JUMP_GATE:
        return this.coordinatesRelation(fleet.target);
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return this.coordinatesRelation(fleet.origin);
      case FleetState.ORBITING:
        return this.currentLocationRelation(fleet);
      default:
        return this.coordinatesRelation(fleet.target);
    }
  }

  protected destinationSegments(fleet: Fleet): CoordinateSegmentVm[] {
    switch (fleet.state) {
      case FleetState.PENDING_JUMP_GATE:
        return [this.toCoordinateSegment(fleet.target)];
      case FleetState.RETURNING:
      case FleetState.MISSION_FAILURE_RETURNING:
        return [this.toCoordinateSegment(fleet.origin)];
      case FleetState.ORBITING:
        return this.currentLocationSegments(fleet);
      default:
        return [this.toCoordinateSegment(fleet.target)];
    }
  }

  protected openCoordinatesInGalaxy(coordinates: { x: number; y: number; z: number }): void {
    void this.router.navigate(
      ['/game/galactic'],
      {
        queryParams: {
          x: coordinates.x,
          y: coordinates.y,
          z: coordinates.z
        }
      }
    );
  }

  protected missionLabel(fleet: Fleet): string {
    return fleet.missionType === FleetMissionType.DEFEND ? 'Guard' : fleet.missionType;
  }

  protected isAttackMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.ATTACK
      || fleet.missionType === FleetMissionType.PLUNDER
      || fleet.missionType === FleetMissionType.INVADE
      || fleet.missionType === FleetMissionType.INTERCEPT
      || fleet.missionType === FleetMissionType.BLOCK;
  }

  protected isRepairMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.REPAIR;
  }

  protected isTransportMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.TRANSPORT
      || fleet.missionType === FleetMissionType.ARMAMENT_DELIVERY;
  }

  protected isColonizeMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.COLONIZE;
  }

  protected isMovementMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.MOVE
      || fleet.missionType === FleetMissionType.HOLD
      || fleet.missionType === FleetMissionType.RECYCLE;
  }

  protected isSpyMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.SPY
      || fleet.missionType === FleetMissionType.STAR_SYSTEM_SPY;
  }

  protected isBombardMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.BOMBARD
      || fleet.missionType === FleetMissionType.SIEGE;
  }

  protected isDefendMission(fleet: Fleet): boolean {
    return fleet.missionType === FleetMissionType.DEFEND;
  }

  protected stateLabel(fleet: Fleet): string {
    if (fleet.state === FleetState.PENDING_JUMP_GATE) {
      return 'PENDING JUMP GATE APPROVAL';
    }

    if (fleet.state === FleetState.ORBITING) {
      return `ORBITING | ${this.orbitActivityLabel(fleet.orbitActivity)}`;
    }

    if (fleet.returnReason === FleetReturnReason.MANUAL_RECALL && fleet.state === FleetState.RETURNING) {
      return 'RETURNING | MANUAL RECALL';
    }

    if (fleet.returnReason === FleetReturnReason.MISSION_FAILURE && fleet.state === FleetState.MISSION_FAILURE_RETURNING) {
      return 'MISSION FAILURE RETURNING';
    }

    return fleet.state.replaceAll('_', ' ');
  }

  protected orbitActivityLabel(activity: FleetOrbitActivity): string {
    switch (activity) {
      case FleetOrbitActivity.PASSIVE_HOLD:
        return 'PASSIVE ORBIT';
      case FleetOrbitActivity.GUARDING:
        return 'GUARDING ORBIT';
      default:
        return activity.replaceAll('_', ' ');
    }
  }

  protected canReturn(fleet: Fleet): boolean {
    return fleet.state === FleetState.PENDING_JUMP_GATE
      || fleet.state === FleetState.MOVING_TO_TARGET
      || fleet.state === FleetState.ORBITING;
  }

  protected canDelay(fleet: Fleet): boolean {
    return fleet.state === FleetState.MOVING_TO_TARGET;
  }

  protected canRequestMaintenance(fleet: Fleet): boolean {
    return fleet.state === FleetState.ORBITING && fleet.maintenanceRequestAvailable;
  }

  protected isActionPending(fleet: Fleet): boolean {
    return this.activeActionFleetId === fleet.fleetId;
  }

  protected hasEta(fleet: Fleet): boolean {
    return fleet.state === FleetState.MOVING_TO_TARGET
      || fleet.state === FleetState.RETURNING
      || fleet.state === FleetState.MISSION_FAILURE_RETURNING;
  }

  protected remainingEta(fleet: Fleet): number {
    if (!this.hasEta(fleet)) {
      return 0;
    }

    const currentTurn = this.gameState.currentTurn();
    if (currentTurn === null) {
      return fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns;
    }

    const elapsedTurns = Math.max(0, currentTurn - fleet.createdAtTurn);
    const totalLegTurns = fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns;
    return Math.max(0, totalLegTurns - elapsedTurns);
  }

  protected progressLabel(fleet: Fleet): string {
    if (!this.hasEta(fleet)) {
      return 'No active travel ETA';
    }

    const currentTurn = this.gameState.currentTurn();
    if (currentTurn === null) {
      return `Travel time ${fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns}`;
    }

    const totalLegTurns = fleet.state === FleetState.MOVING_TO_TARGET ? fleet.travelTurns : fleet.returnTurns;
    const elapsedTurns = Math.max(0, Math.min(totalLegTurns, currentTurn - fleet.createdAtTurn));
    return `${elapsedTurns}/${totalLegTurns} turns elapsed`;
  }

  protected shipRepairCapability(fleet: Fleet): number {
    return calculateRepairCapabilityForManyShips(fleet.ships).shipRepair;
  }

  protected droneRepairCapability(fleet: Fleet): number {
    return calculateRepairCapabilityForManyShips(fleet.ships).droneRepair;
  }

  protected bombardmentCapability(fleet: Fleet): string {
    let shots = 0;
    let damage = 0;

    for (const [shipType, amount] of ManyShips.countByType(fleet.ships).entries()) {
      const blueprint = this.shipBlueprints.get(shipType);
      if (!blueprint) {
        continue;
      }

      for (const weapon of blueprint.weapons) {
        if (weapon.type !== WeaponType.BOMBARDMENT_WEAPONS) {
          continue;
        }

        shots += Math.max(0, weapon.shots) * amount;
        damage += Math.max(0, weapon.dmg) * Math.max(0, weapon.shots) * amount;
      }
    }

    if (shots <= 0) {
      return 'No bombardment weapons';
    }

    return `${shots} shots / ${damage} raw damage`;
  }

  protected operationDetail(fleet: Fleet): string | null {
    if (fleet.state === FleetState.PENDING_JUMP_GATE) {
      return fleet.pendingJumpGateRequestId
        ? `Waiting for Jump Gate request #${fleet.pendingJumpGateRequestId}.`
        : 'Waiting for Jump Gate approval.';
    }

    if (fleet.missionType === FleetMissionType.SIEGE) {
      return `Siege orbit: ${this.bombardmentCapability(fleet)}`;
    }

    if (fleet.missionType === FleetMissionType.BOMBARD) {
      return `Bombardment pass: ${this.bombardmentCapability(fleet)}`;
    }

    if (fleet.missionType === FleetMissionType.REPAIR) {
      return `Repair support: Ship ${this.shipRepairCapability(fleet)} | Drone ${this.droneRepairCapability(fleet)}`;
    }

    if (fleet.missionType === FleetMissionType.RECYCLE) {
      return `Recycling rate: ${calculateRecycleCapabilityForManyShips(fleet.ships)} / turn`;
    }

    return null;
  }

  protected maintenanceDialogOpen(): boolean {
    return this.maintenanceDialogFleetId !== null;
  }

  protected maintenanceShipOptions(): FleetMaintenanceShipOptionDto[] {
    return this.maintenanceOptions?.availableShips ?? [];
  }

  protected maintenanceBombOptions(): FleetMaintenanceBombOptionDto[] {
    return this.maintenanceOptions?.availableBombs ?? [];
  }

  protected selectedSupportUsage(): number {
    return this.maintenanceShipOptions().reduce((sum, option) =>
      sum + ((this.requestedShipAmounts[option.type] ?? 0) * option.size), 0)
      + this.maintenanceBombOptions().reduce((sum, option) =>
        sum + ((this.requestedBombAmounts[option.type] ?? 0) * option.size), 0);
  }

  protected hasMaintenanceSelection(): boolean {
    return this.requestedFuel > 0
      || this.maintenanceShipOptions().some((option) => (this.requestedShipAmounts[option.type] ?? 0) > 0)
      || this.maintenanceBombOptions().some((option) => (this.requestedBombAmounts[option.type] ?? 0) > 0);
  }

  protected canSubmitMaintenanceRequest(): boolean {
    if (this.maintenanceSubmitting || !this.maintenanceOptions || !this.hasMaintenanceSelection()) {
      return false;
    }

    if (this.requestedFuel > Math.min(this.maintenanceOptions.fuelCap, this.maintenanceOptions.availableFuel, this.maintenanceOptions.remainingCargoCapacity)) {
      return false;
    }

    if (this.selectedSupportUsage() > this.maintenanceOptions.supportCap) {
      return false;
    }

    return true;
  }

  protected updateRequestedFuel(value: number | string): void {
    this.requestedFuel = this.normalizeAmount(value);
  }

  protected updateRequestedShipAmount(type: string, value: number | string): void {
    this.requestedShipAmounts[type] = this.normalizeAmount(value);
  }

  protected updateRequestedBombAmount(type: string, value: number | string): void {
    this.requestedBombAmounts[type] = this.normalizeAmount(value);
  }

  protected openMaintenanceRequest(fleet: Fleet): void {
    if (!this.canRequestMaintenance(fleet)) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    this.maintenanceDialogFleetId = fleet.fleetId;
    this.maintenanceDialogLoading = true;
    this.maintenanceDialogError = null;
    this.maintenanceOptions = null;
    this.requestedFuel = 0;
    this.requestedShipAmounts = {};
    this.requestedBombAmounts = {};

    this.gameApi.getFleetMaintenanceOptions(fleet.fleetId, session.token)
      .pipe(finalize(() => {
        this.maintenanceDialogLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (options) => {
          this.maintenanceOptions = options;
        },
        error: (error) => {
          this.maintenanceDialogError = error?.error?.error ?? 'Unable to load maintenance options.';
        }
      });
  }

  protected closeMaintenanceRequest(): void {
    if (this.maintenanceSubmitting) {
      return;
    }

    this.maintenanceDialogFleetId = null;
    this.maintenanceOptions = null;
    this.maintenanceDialogError = null;
    this.requestedFuel = 0;
    this.requestedShipAmounts = {};
    this.requestedBombAmounts = {};
  }

  protected submitMaintenanceRequest(): void {
    if (!this.canSubmitMaintenanceRequest() || this.maintenanceDialogFleetId === null) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.maintenanceDialogError = 'No player session found.';
      return;
    }

    this.maintenanceSubmitting = true;
    this.maintenanceDialogError = null;
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.createMaintenanceRequest(
      this.maintenanceDialogFleetId,
      this.buildMaintenancePayload(),
      session.token
    )
      .pipe(finalize(() => {
        this.maintenanceSubmitting = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.handleMaintenanceResponse(response);
        },
        error: (error) => {
          this.maintenanceDialogError = error?.error?.error ?? 'Unable to submit maintenance request.';
        }
      });
  }

  protected returnFleet(fleet: Fleet): void {
    if (!this.canReturn(fleet)) {
      return;
    }

    this.runFleetAction(
      fleet.fleetId,
      (token) => this.gameApi.returnFleet(fleet.fleetId, token),
      'Unable to return fleet.'
    );
  }

  protected delayFleet(fleet: Fleet): void {
    if (!this.canDelay(fleet)) {
      return;
    }

    this.runFleetAction(
      fleet.fleetId,
      (token) => this.gameApi.delayFleet(fleet.fleetId, token),
      'Unable to delay fleet.'
    );
  }

  private loadActiveFleets(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.actionError = null;

    forkJoin({
      activeFleets: this.gameApi.getActiveFleets(session.token),
      ownedPlanets: this.gameApi.getOwnedPlanets(session.token)
    })
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: ({ activeFleets, ownedPlanets }) => {
          this.ownedPlanets = [...ownedPlanets];
          this.applyActiveFleetUpdate(activeFleets, session.token);
          if (this.activeFleets.length > 0) {
            this.tutorialService.autoOpenTutorial('operationsView');
          }
        },
        error: () => {
          this.loadError = 'Unable to load active fleets.';
        }
      });
  }

  private usesOriginCoordinates(state: FleetState): boolean {
    return state === FleetState.MOVING_TO_TARGET;
  }

  private isRecalledInTransit(fleet: Fleet): boolean {
    return fleet.state === FleetState.RETURNING
      && fleet.returnReason === FleetReturnReason.MANUAL_RECALL
      && fleet.returnTurns < fleet.travelTurns;
  }

  private applyActiveFleetUpdate(activeFleets: Fleet[], token?: string): void {
    this.activeFleets = [...activeFleets].sort((left, right) => left.fleetId - right.fleetId);
    if (token) {
      this.refreshCoordinateOwnerNames(token, this.activeFleets);
    }
  }

  private runFleetAction(
    fleetId: number,
    action: (token: string) => ReturnType<GameApiService['getActiveFleets']>,
    fallbackError: string
  ): void {
    const session = this.playerSession.load();
    if (!session || this.activeActionFleetId !== null) {
      return;
    }

    this.activeActionFleetId = fleetId;
    this.actionError = null;
    this.actionSuccess = null;

    action(session.token)
      .pipe(finalize(() => {
        this.activeActionFleetId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (activeFleets) => {
          this.applyActiveFleetUpdate(activeFleets, session.token);
          if (this.maintenanceDialogFleetId === fleetId) {
            this.closeMaintenanceRequest();
          }
        },
        error: (error) => {
          this.actionError = error?.error?.error ?? fallbackError;
        }
      });
  }

  private buildMaintenancePayload(): MaintenanceTransferPayloadDto {
    return {
      fuel: this.requestedFuel,
      ships: this.maintenanceShipOptions()
        .map((option) => ({
          type: option.type,
          amount: Math.min(this.requestedShipAmounts[option.type] ?? 0, option.available)
        }))
        .filter((entry) => entry.amount > 0),
      bombs: this.maintenanceBombOptions()
        .map((option) => ({
          type: option.type,
          amount: Math.min(this.requestedBombAmounts[option.type] ?? 0, option.available)
        }))
        .filter((entry) => entry.amount > 0)
    };
  }

  private handleMaintenanceResponse(response: CreateMaintenanceRequestResponse): void {
    const session = this.playerSession.load();
    this.applyActiveFleetUpdate(response.activeFleets, session?.token);
    this.actionSuccess = response.message;
    this.closeMaintenanceRequest();
  }

  private refreshCoordinateOwnerNames(token: string, activeFleets: Fleet[]): void {
    const ownerInfoByCoordinates = new Map<string, { ownerId: number | null; ownerName: string | null }>();
    for (const planet of this.ownedPlanets) {
      ownerInfoByCoordinates.set(
        this.coordinatesKey(planet.coordinates),
        {
          ownerId: planet.info.ownerId,
          ownerName: planet.info.ownerPlayerName ?? null
        }
      );
    }

    const coordinatesToFetch = new Map<string, { x: number; y: number; z: number }>();
    for (const fleet of activeFleets) {
      for (const coordinates of [fleet.origin, fleet.target]) {
        const key = this.coordinatesKey(coordinates);
        if (!ownerInfoByCoordinates.has(key) && !coordinatesToFetch.has(key)) {
          coordinatesToFetch.set(key, coordinates);
        }
      }
    }

    if (coordinatesToFetch.size <= 0) {
      this.replaceCoordinateOwnerInfos(ownerInfoByCoordinates);
      return;
    }

    const coordinateEntries = [...coordinatesToFetch.entries()];
    forkJoin(
      coordinateEntries.map(([_, coordinates]) =>
        this.gameApi.getClientPlanet(coordinates.x, coordinates.y, coordinates.z, token).pipe(
          catchError(() => of(null))
        )
      )
    ).subscribe({
      next: (planets) => {
        planets.forEach((planet, index) => {
          const [key] = coordinateEntries[index] ?? [];
          if (!key) {
            return;
          }
          ownerInfoByCoordinates.set(key, {
            ownerId: planet?.info.ownerId ?? null,
            ownerName: planet?.info.ownerPlayerName ?? null
          });
        });
        this.replaceCoordinateOwnerInfos(ownerInfoByCoordinates);
      },
      error: () => {
        this.replaceCoordinateOwnerInfos(ownerInfoByCoordinates);
      }
    });
  }

  private replaceCoordinateOwnerInfos(entries: Map<string, { ownerId: number | null; ownerName: string | null }>): void {
    this.ownerInfoByCoordinates.clear();
    for (const [key, ownerInfo] of entries.entries()) {
      this.ownerInfoByCoordinates.set(key, ownerInfo);
    }
    this.cdr.markForCheck();
  }

  private coordinatesWithOwnerLabel(coordinates: { x: number; y: number; z: number }): string {
    const coordinatesLabel = this.coordinatesLabel(coordinates.x, coordinates.y, coordinates.z);
    const ownerInfo = this.ownerInfoByCoordinates.get(this.coordinatesKey(coordinates)) ?? null;
    return ownerInfo?.ownerName ? `${coordinatesLabel} - ${ownerInfo.ownerName}` : coordinatesLabel;
  }

  private coordinatesRelation(coordinates: { x: number; y: number; z: number }): string {
    const ownerInfo = this.ownerInfoByCoordinates.get(this.coordinatesKey(coordinates)) ?? null;
    if (!ownerInfo?.ownerId) {
      return 'none';
    }

    const ownPlayerId = this.ownedPlanets[0]?.info.ownerId ?? null;
    if (ownPlayerId === null) {
      return 'none';
    }

    const status = this.gameState.diplomacyResolver().getStatus(ownPlayerId, ownerInfo.ownerId);
    switch (status) {
      case DiplomaticStatus.SELF:
        return 'own';
      case DiplomaticStatus.WAR:
        return 'war';
      case DiplomaticStatus.ALLIED:
        return 'allied';
      case DiplomaticStatus.PEACE:
        return 'peace';
      default:
        return 'none';
    }
  }

  private toCoordinateSegment(coordinates: { x: number; y: number; z: number }): CoordinateSegmentVm {
    const ownerInfo = this.ownerInfoByCoordinates.get(this.coordinatesKey(coordinates)) ?? null;
    return {
      coordinates,
      ownerName: ownerInfo?.ownerName ?? null,
      relation: this.coordinatesRelation(coordinates)
    };
  }

  private coordinatesKey(coordinates: { x: number; y: number; z: number }): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }

  private normalizeAmount(value: number | string): number {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.floor(numericValue));
  }

  private maxActiveFleetCount(): number {
    return maxActiveFleets(this.techLevel(TechnologyType.COMPUTER_TECHNOLOGY));
  }

  private techLevel(technologyType: TechnologyType): number {
    const techLevels = this.ownedPlanets[0]?.reportData?.techLevels ?? [];
    const matchingEntry = techLevels.find((entry) => entry.type === technologyType);
    return matchingEntry?.level ?? 0;
  }
}
