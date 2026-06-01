import { NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from '../../../core/game-state.service';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { DiplomaticStatus } from '../../../models/diplomacy/diplomatic-status';
import { FleetMissionType } from '../../../models/enums/fleet-mission-type';
import { WeaponType } from '../../../models/enums/weapon-type';
import { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } from '../../../models/fleets/fleet';
import type { FleetOperationHistoryEntry } from '../../../models/fleets/fleet-operation-history';
import { ManyShips } from '../../../models/fleets/many-ships';
import type { ClientPlanetDto } from '../../../models/game-api-types';
import { calculateRepairCapabilityForManyShips } from '../../../models/repairs/ship-repair-capability';
import { calculateRecycleCapabilityForManyShips } from '../../../models/recycling/recycling-capability';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';

type CoordinateSegmentVm = {
  coordinates: { x: number; y: number; z: number };
  ownerName: string | null;
  relation: string;
};

type CoordinateOwnerInfo = {
  ownerId: number | null;
  ownerName: string | null;
};

@Component({
  selector: 'app-fleet-operation-card',
  imports: [NgClass, TooltipDirective],
  templateUrl: './fleet-operation-card.component.html',
  styleUrl: './fleet-operation-card.component.css'
})
export class FleetOperationCardComponent {
  @Input({ required: true }) public ownPlayerId: number | null = null;
  @Input() public fleet: Fleet | null = null;
  @Input() public resolvedOperation: FleetOperationHistoryEntry | null = null;
  @Input() public ownedPlanets: ClientPlanetDto[] = [];
  @Input() public ownerInfoByCoordinates: Map<string, CoordinateOwnerInfo> = new Map();
  @Input() public actionPending = false;
  @Input() public showActions = true;
  @Input() public showMaintenanceAction = true;
  @Input() public tutorialId: string | null = null;
  @Output() public returnRequested = new EventEmitter<Fleet>();
  @Output() public delayRequested = new EventEmitter<Fleet>();
  @Output() public maintenanceRequested = new EventEmitter<Fleet>();

  private readonly shipBlueprints = ShipBlueprintsFactory.fromDefaultJson();

  public constructor(
    private readonly gameState: GameStateService,
    private readonly router: Router
  ) {}

  protected activeFleet(): Fleet | null {
    return this.fleet;
  }

  protected isResolved(): boolean {
    return this.resolvedOperation !== null;
  }

  protected missionType(): FleetMissionType | null {
    return this.fleet?.missionType ?? this.resolvedOperation?.missionType ?? null;
  }

  protected fleetId(): number | null {
    return this.fleet?.fleetId ?? this.resolvedOperation?.fleetId ?? null;
  }

  protected totalShips(fleet: Fleet): number {
    return ManyShips.totalShipsCount(fleet.ships);
  }

  protected isOwnFleet(fleet: Fleet): boolean {
    return this.ownPlayerId !== null && fleet.ownerId === this.ownPlayerId;
  }

  protected canReturn(fleet: Fleet): boolean {
    return this.showActions
      && this.showMaintenanceAction
      && this.isOwnFleet(fleet)
      && (
        fleet.state === FleetState.PENDING_JUMP_GATE
        || fleet.state === FleetState.MOVING_TO_TARGET
        || fleet.state === FleetState.ORBITING
      );
  }

  protected canDelay(fleet: Fleet): boolean {
    return this.showActions
      && this.isOwnFleet(fleet)
      && fleet.state === FleetState.MOVING_TO_TARGET;
  }

  protected canRequestMaintenance(fleet: Fleet): boolean {
    return this.showActions
      && this.isOwnFleet(fleet)
      && fleet.state === FleetState.ORBITING
      && fleet.maintenanceRequestAvailable;
  }

  protected requestReturn(fleet: Fleet): void {
    if (this.canReturn(fleet)) {
      this.returnRequested.emit(fleet);
    }
  }

  protected requestDelay(fleet: Fleet): void {
    if (this.canDelay(fleet)) {
      this.delayRequested.emit(fleet);
    }
  }

  protected requestMaintenance(fleet: Fleet): void {
    if (this.canRequestMaintenance(fleet)) {
      this.maintenanceRequested.emit(fleet);
    }
  }

  protected missionLabel(): string {
    const missionType = this.missionType();
    if (!missionType) {
      return 'Operation';
    }

    return missionType === FleetMissionType.DEFEND ? 'Guard' : missionType;
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

  protected resolvedStateLabel(operation: FleetOperationHistoryEntry): string {
    return `${operation.outcomeType.replaceAll('_', ' ')} | Turn ${operation.resolvedTurn}`;
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

  protected operationOriginName(operation: FleetOperationHistoryEntry): string {
    return operation.originPlanetName ?? this.coordinatesLabel(operation.origin.x, operation.origin.y, operation.origin.z);
  }

  protected operationTargetName(operation: FleetOperationHistoryEntry): string {
    return operation.targetPlanetName ?? this.coordinatesLabel(operation.target.x, operation.target.y, operation.target.z);
  }

  protected operationOriginSegments(operation: FleetOperationHistoryEntry): CoordinateSegmentVm[] {
    return [this.toCoordinateSegment(operation.origin)];
  }

  protected operationTargetSegments(operation: FleetOperationHistoryEntry): CoordinateSegmentVm[] {
    return [this.toCoordinateSegment(operation.target)];
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

  protected shipSummary(fleet: Fleet): string {
    return [...ManyShips.countByType(fleet.ships).entries()]
      .sort(([leftType], [rightType]) => leftType.localeCompare(rightType))
      .map(([type, amount]) => `${type} x${amount}`)
      .join(', ');
  }

  protected shipRepairCapability(fleet: Fleet): number {
    return calculateRepairCapabilityForManyShips(fleet.ships).shipRepair;
  }

  protected droneRepairCapability(fleet: Fleet): number {
    return calculateRepairCapabilityForManyShips(fleet.ships).droneRepair;
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

  protected coordinatesLabel(x: number, y: number, z: number): string {
    return `${x}:${y}:${z}`;
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

  protected isRemoteOriginFleet(fleet: Fleet): boolean {
    return fleet.isRemoteOrigin === true;
  }

  protected cardModifierClass(): string {
    const missionType = this.missionType();
    if (this.isResolved()) {
      return 'fleet-operation-card--resolved';
    }

    if (!missionType) {
      return '';
    }

    if (
      missionType === FleetMissionType.ATTACK
      || missionType === FleetMissionType.PLUNDER
      || missionType === FleetMissionType.INVADE
      || missionType === FleetMissionType.INTERCEPT
      || missionType === FleetMissionType.BLOCK
    ) {
      return 'fleet-operation-card--attack';
    }

    if (missionType === FleetMissionType.REPAIR) {
      return 'fleet-operation-card--repair';
    }

    if (missionType === FleetMissionType.TRANSPORT || missionType === FleetMissionType.ARMAMENT_DELIVERY) {
      return 'fleet-operation-card--transport';
    }

    if (missionType === FleetMissionType.COLONIZE) {
      return 'fleet-operation-card--colonize';
    }

    if (
      missionType === FleetMissionType.MOVE
      || missionType === FleetMissionType.HOLD
      || missionType === FleetMissionType.RECYCLE
    ) {
      return 'fleet-operation-card--movement';
    }

    if (missionType === FleetMissionType.SPY || missionType === FleetMissionType.STAR_SYSTEM_SPY) {
      return 'fleet-operation-card--spy';
    }

    if (missionType === FleetMissionType.BOMBARD || missionType === FleetMissionType.SIEGE) {
      return 'fleet-operation-card--bombard';
    }

    if (missionType === FleetMissionType.DEFEND) {
      return 'fleet-operation-card--defend';
    }

    return '';
  }

  private orbitActivityLabel(activity: FleetOrbitActivity): string {
    switch (activity) {
      case FleetOrbitActivity.PASSIVE_HOLD:
        return 'PASSIVE ORBIT';
      case FleetOrbitActivity.GUARDING:
        return 'GUARDING ORBIT';
      default:
        return activity.replaceAll('_', ' ');
    }
  }

  private usesOriginCoordinates(state: FleetState): boolean {
    return state === FleetState.MOVING_TO_TARGET;
  }

  private isRecalledInTransit(fleet: Fleet): boolean {
    return fleet.state === FleetState.RETURNING
      && fleet.returnReason === FleetReturnReason.MANUAL_RECALL
      && fleet.returnTurns < fleet.travelTurns;
  }

  private bombardmentCapability(fleet: Fleet): string {
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

  private toCoordinateSegment(coordinates: { x: number; y: number; z: number }): CoordinateSegmentVm {
    const ownerInfo = this.ownerInfoByCoordinates.get(this.coordinatesKey(coordinates)) ?? null;
    return {
      coordinates,
      ownerName: ownerInfo?.ownerName ?? null,
      relation: this.coordinatesRelation(coordinates)
    };
  }

  private coordinatesRelation(coordinates: { x: number; y: number; z: number }): string {
    const ownerInfo = this.ownerInfoByCoordinates.get(this.coordinatesKey(coordinates)) ?? null;
    if (!ownerInfo?.ownerId || this.ownPlayerId === null) {
      return 'none';
    }

    const status = this.gameState.diplomacyResolver().getStatus(this.ownPlayerId, ownerInfo.ownerId);
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

  private coordinatesKey(coordinates: { x: number; y: number; z: number }): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }
}
