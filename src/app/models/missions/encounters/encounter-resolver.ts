import { SpaceBattleResolver, type SpaceBattleResult } from '../../battles/space-battle-resolver';
import { ManyDefences, type DefenceAmountRequest } from '../../defences/many-defences';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { DiplomacyResolver } from '../../diplomacy/diplomacy-resolver';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { Fleet } from '../../fleets/fleet';
import { ManyShips } from '../../fleets/many-ships';
import { Planet } from '../../planets/planet';
import { Player } from '../../player';
import { ResourcesPack } from '../../resources-pack';
import type { FleetMission } from '../fleet-mission';
import type { FleetEncounterOutcome } from './encounter-outcome';

export type PlanetOrbitEncounterArrival = {
  fleet: Fleet;
  mission: FleetMission;
  owner: Player | null;
  originPlanet: Planet | null;
  targetPlanet: Planet;
  targetOwner: Player | null;
  resolvedTurnNumber: number;
};

export type PlanetOrbitEncounterOccupantFleet = {
  fleet: Fleet;
  owner: Player | null;
};

export type PlanetOrbitEncounterResolvedArrival = {
  arrival: PlanetOrbitEncounterArrival;
  outcome: FleetEncounterOutcome;
};

type OrbitForceRecord = {
  kind: 'orbitingShips' | 'planetDefences' | 'fleet';
  owner: Player | null;
  planet: Planet | null;
  fleet: Fleet | null;
  ships: ManyShips;
  defences: ManyDefences;
  orderKey: number;
};

const MISSION_PRIORITY: Record<FleetMissionType, number> = {
  [FleetMissionType.DEFEND]: 0,
  [FleetMissionType.ATTACK]: 1,
  [FleetMissionType.PLUNDER]: 2,
  [FleetMissionType.BOMBARD]: 3,
  [FleetMissionType.SIEGE]: 4,
  [FleetMissionType.MOVE]: 5,
  [FleetMissionType.TRANSPORT]: 6,
  [FleetMissionType.SPY]: 7,
  [FleetMissionType.COLONIZE]: 8,
  [FleetMissionType.INVADE]: 9,
  [FleetMissionType.BLOCK]: 10,
  [FleetMissionType.INTERCEPT]: 11,
  [FleetMissionType.STAR_SYSTEM_SPY]: 12,
  [FleetMissionType.RECYCLE]: 13,
  [FleetMissionType.REPAIR]: 14
};

export class EncounterResolver {
  constructor(
    private readonly diplomacyResolver = new DiplomacyResolver(),
    private readonly battleResolver = new SpaceBattleResolver()
  ) {}

  public resolvePlanetOrbit(
    arrivals: PlanetOrbitEncounterArrival[],
    stationaryOccupants: PlanetOrbitEncounterOccupantFleet[] = []
  ): PlanetOrbitEncounterResolvedArrival[] {
    if (arrivals.length <= 0) {
      return [];
    }

    const sortedArrivals = [...arrivals].sort((left, right) => this.compareArrivalPriority(left, right));
    const pendingArrivals = [...sortedArrivals];
    const resolvedArrivals: PlanetOrbitEncounterResolvedArrival[] = [];
    const targetPlanet = arrivals[0].targetPlanet;
    const orbitForces = this.createInitialOrbitForces(targetPlanet, stationaryOccupants);

    while (pendingArrivals.length > 0) {
      const current = pendingArrivals.shift()!;
      const currentOwnerId = current.owner?.playerId ?? current.fleet.ownerId;

      if (!current.mission.participatesInEncounter()) {
        resolvedArrivals.push({
          arrival: current,
          outcome: {
            fleetId: current.fleet.fleetId,
            resolution: 'notInvolved'
          }
        });
        continue;
      }

      const coalition = [
        current,
        ...pendingArrivals.filter((entry) => this.isCoalitionMember(currentOwnerId, entry))
      ].sort((left, right) => this.compareArrivalPriority(left, right));
      for (const member of coalition.slice(1)) {
        const memberIndex = pendingArrivals.findIndex((entry) => entry.fleet.fleetId === member.fleet.fleetId);
        if (memberIndex >= 0) {
          pendingArrivals.splice(memberIndex, 1);
        }
      }

      const hostileDefenderCoalition = this.selectHostileDefenderCoalition(currentOwnerId, targetPlanet, orbitForces);
      if (!hostileDefenderCoalition || this.totalForceCombatants(hostileDefenderCoalition) <= 0) {
        for (const member of coalition) {
          resolvedArrivals.push({
            arrival: member,
            outcome: {
              fleetId: member.fleet.fleetId,
              resolution: 'notInvolved'
            }
          });
        }
        continue;
      }

      const coalitionSurvivorPool = this.resolveCoalitionBattle(
        coalition,
        hostileDefenderCoalition,
        targetPlanet
      );
      this.distributeCoalitionSurvivors(coalition, coalitionSurvivorPool);
      const hostileDefendersStillPresent = this.selectHostileDefenderCoalition(currentOwnerId, targetPlanet, orbitForces);
      const coalitionHasSurvivors = coalition.some((entry) => ManyShips.totalShipsCount(entry.fleet.ships) > 0);
      const coalitionWon = coalitionHasSurvivors
        && (!hostileDefendersStillPresent || this.totalForceCombatants(hostileDefendersStillPresent) <= 0);

      for (const member of coalition) {
        const survivingShips = ManyShips.totalShipsCount(member.fleet.ships);
        resolvedArrivals.push({
          arrival: member,
          outcome: {
            fleetId: member.fleet.fleetId,
            resolution: survivingShips <= 0
              ? 'defeat'
              : coalitionWon
                ? 'victory'
                : 'retreat'
          }
        });
      }
    }

    return resolvedArrivals.sort((left, right) => this.compareArrivalPriority(left.arrival, right.arrival));
  }

  private createInitialOrbitForces(
    targetPlanet: Planet,
    stationaryOccupants: PlanetOrbitEncounterOccupantFleet[]
  ): OrbitForceRecord[] {
    const orbitForces: OrbitForceRecord[] = [];

    if (targetPlanet.info.ownerId !== null && ManyShips.totalShipsCount(targetPlanet.rBDSFTQ.ships) > 0) {
      orbitForces.push({
        kind: 'orbitingShips',
        owner: null,
        planet: targetPlanet,
        fleet: null,
        ships: targetPlanet.rBDSFTQ.ships,
        defences: ManyDefences.empty(),
        orderKey: -1
      });
    }

    if (targetPlanet.info.ownerId !== null && ManyDefences.totalDefencesCount(targetPlanet.rBDSFTQ.defences) > 0) {
      orbitForces.push({
        kind: 'planetDefences',
        owner: null,
        planet: targetPlanet,
        fleet: null,
        ships: ManyShips.empty(),
        defences: targetPlanet.rBDSFTQ.defences,
        orderKey: -2
      });
    }

    for (const occupant of stationaryOccupants) {
      if (ManyShips.totalShipsCount(occupant.fleet.ships) <= 0) {
        continue;
      }

      orbitForces.push({
        kind: 'fleet',
        owner: occupant.owner,
        planet: null,
        fleet: occupant.fleet,
        ships: occupant.fleet.ships,
        defences: ManyDefences.empty(),
        orderKey: occupant.fleet.fleetId
      });
    }

    return orbitForces;
  }

  private compareArrivalPriority(
    left: PlanetOrbitEncounterArrival,
    right: PlanetOrbitEncounterArrival
  ): number {
    const leftPriority = MISSION_PRIORITY[left.fleet.missionType] ?? 999;
    const rightPriority = MISSION_PRIORITY[right.fleet.missionType] ?? 999;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.fleet.fleetId - right.fleet.fleetId;
  }

  private isCoalitionMember(
    coalitionOwnerId: number,
    candidate: PlanetOrbitEncounterArrival
  ): boolean {
    if (!candidate.mission.participatesInEncounter()) {
      return false;
    }

    const candidateOwnerId = candidate.owner?.playerId ?? candidate.fleet.ownerId;
    const diplomaticStatus = this.diplomacyResolver.getStatus(coalitionOwnerId, candidateOwnerId);
    return diplomaticStatus === DiplomaticStatus.SELF || diplomaticStatus === DiplomaticStatus.ALLIED;
  }

  private selectHostileDefenderCoalition(
    attackerOwnerId: number,
    targetPlanet: Planet,
    orbitForces: OrbitForceRecord[]
  ): OrbitForceRecord[] | null {
    const hostileForces = orbitForces.filter((force) => {
      const ownerId = this.resolveForceOwnerId(force, targetPlanet);
      if (ownerId === null) {
        return false;
      }

      return this.diplomacyResolver.getStatus(attackerOwnerId, ownerId) === DiplomaticStatus.WAR;
    });

    if (hostileForces.length <= 0) {
      return null;
    }

    const planetOwnerId = targetPlanet.info.ownerId;
    if (planetOwnerId !== null && this.diplomacyResolver.getStatus(attackerOwnerId, planetOwnerId) === DiplomaticStatus.WAR) {
      const planetOwnerCoalition = hostileForces.filter((force) => {
        const ownerId = this.resolveForceOwnerId(force, targetPlanet);
        const status = this.diplomacyResolver.getStatus(planetOwnerId, ownerId);
        return status === DiplomaticStatus.SELF || status === DiplomaticStatus.ALLIED;
      });
      if (planetOwnerCoalition.length > 0) {
        return planetOwnerCoalition;
      }
    }

    const fallbackSeed = [...hostileForces].sort((left, right) => left.orderKey - right.orderKey)[0];
    const seedOwnerId = this.resolveForceOwnerId(fallbackSeed, targetPlanet);
    if (seedOwnerId === null) {
      return [fallbackSeed];
    }

    return hostileForces.filter((force) => {
      const ownerId = this.resolveForceOwnerId(force, targetPlanet);
      const status = this.diplomacyResolver.getStatus(seedOwnerId, ownerId);
      return status === DiplomaticStatus.SELF || status === DiplomaticStatus.ALLIED;
    });
  }

  private resolveCoalitionBattle(
    arrivals: PlanetOrbitEncounterArrival[],
    defenders: OrbitForceRecord[],
    targetPlanet: Planet
  ): ManyShips {
    const attacker = arrivals[0].owner;
    const defender = this.resolveDefenderPlayer(arrivals[0].targetOwner, defenders);
    if (!attacker || !defender) {
      return ManyShips.empty();
    }

    const coalitionShips = ManyShips.empty();
    const attackerCargoByFleetId = new Map<number, ResourcesPack>();
    for (const arrival of arrivals) {
      coalitionShips.addManyShips(arrival.fleet.ships);
      attackerCargoByFleetId.set(arrival.fleet.fleetId, new ResourcesPack(
        arrival.fleet.cargo.metal,
        arrival.fleet.cargo.crystal,
        arrival.fleet.cargo.deuterium
      ));
    }

    const coalitionInitialShipCounts = arrivals.map((arrival) => ({
      fleetId: arrival.fleet.fleetId,
      ships: ManyShips.fromData(arrival.fleet.ships)
    }));
    const defenderInitialForces = defenders.map((force) => ({
      force,
      ships: ManyShips.fromData(force.ships)
      ,
      defences: ManyDefences.fromData(force.defences)
    }));

    const battleResult = this.battleResolver.resolve({
      attacker: {
        player: attacker,
        ships: ManyShips.toShipInstances(coalitionShips),
        label: attacker.playerName
      },
      defender: {
        player: defender,
        ships: ManyShips.toShipInstances(this.mergeForceShips(defenders)),
        defences: ManyDefences.toDefenceInstances(this.mergeForceDefences(defenders)),
        label: defender.playerName
      },
      reportContext: {
        createdTurn: arrivals[0].resolvedTurnNumber,
        sourceCoordinates: {
          x: targetPlanet.basicInfo.solarSystem.coordinates.x,
          y: targetPlanet.basicInfo.solarSystem.coordinates.y,
          z: Math.max(0, targetPlanet.basicInfo.order - 1)
        },
        sourcePlanetName: targetPlanet.basicInfo.name,
        sourceSystemName: targetPlanet.basicInfo.solarSystem.name
      },
      maxRounds: arrivals[0].mission.getBattleRounds()
    });

    const coalitionSurvivors = ManyShips.fromShipInstances(battleResult.attacker.survivingShips);
    const overflowShips = coalitionSurvivors.trimNonJumpShipsToTravelHangarCapacity();
    const defenderSurvivorPool = ManyShips.fromShipInstances(battleResult.defender.survivingShips);
    const defenderDefenceSurvivorPool = ManyDefences.fromDefenceInstances(battleResult.defender.survivingDefences);

    for (const defenderEntry of defenderInitialForces) {
      const requested = this.toShipAmountRequests(defenderEntry.ships);
      const allocated = defenderSurvivorPool.extractAnyShipsByType(requested);
      const requestedDefences = this.toDefenceAmountRequests(defenderEntry.defences);
      const allocatedDefences = defenderDefenceSurvivorPool.extractAnyDefencesByType(requestedDefences);
      if (defenderEntry.force.kind === 'orbitingShips' && defenderEntry.force.planet) {
        defenderEntry.force.planet.rBDSFTQ.ships = allocated;
      } else if (defenderEntry.force.kind === 'planetDefences' && defenderEntry.force.planet) {
        defenderEntry.force.planet.rBDSFTQ.defences = allocatedDefences;
      } else if (defenderEntry.force.fleet) {
        defenderEntry.force.fleet.ships = allocated;
      }
    }

    const coalitionSurvivorPoolForCargo = ManyShips.fromData(coalitionSurvivors);
    const lostAttackerCargo = new ResourcesPack(0, 0, 0);
    for (const attackerEntry of coalitionInitialShipCounts) {
      const requested = this.toShipAmountRequests(attackerEntry.ships);
      const allocated = coalitionSurvivorPoolForCargo.extractAnyShipsByType(requested);
      if (ManyShips.totalShipsCount(allocated) <= 0) {
        const lostCargo = attackerCargoByFleetId.get(attackerEntry.fleetId);
        if (lostCargo) {
          lostAttackerCargo.addResourcePack(lostCargo);
        }
      }
    }

    targetPlanet.rBDSFTQ.spaceDebris.addResourcePack(
      this.calculateBattleDebris(battleResult, overflowShips, lostAttackerCargo)
    );
    targetPlanet.rBDSFTQ.resources.addResourcePack(this.calculateDefenceDebris(battleResult));

    return coalitionSurvivors;
  }

  private distributeCoalitionSurvivors(
    arrivals: PlanetOrbitEncounterArrival[],
    coalitionSurvivorPoolSource: ManyShips
  ): void {
    const coalitionSurvivorPool = ManyShips.fromData(coalitionSurvivorPoolSource);
    for (const arrival of arrivals) {
      const requested = this.toShipAmountRequests(arrival.fleet.ships);
      arrival.fleet.ships = coalitionSurvivorPool.extractAnyShipsByType(requested);
    }
  }

  private mergeForceShips(defenders: OrbitForceRecord[]): ManyShips {
    const mergedShips = ManyShips.empty();
    for (const defender of defenders) {
      mergedShips.addManyShips(defender.ships);
    }

    return mergedShips;
  }

  private mergeForceDefences(defenders: OrbitForceRecord[]): ManyDefences {
    const mergedDefences = ManyDefences.empty();
    for (const defender of defenders) {
      mergedDefences.addManyDefences(defender.defences);
    }

    return mergedDefences;
  }

  private totalForceCombatants(defenders: OrbitForceRecord[]): number {
    return defenders.reduce(
      (total, defender) =>
        total
        + ManyShips.totalShipsCount(defender.ships)
        + ManyDefences.totalDefencesCount(defender.defences),
      0
    );
  }

  private resolveDefenderPlayer(
    targetOwner: Player | null,
    defenders: OrbitForceRecord[]
  ): Player | null {
    if (targetOwner) {
      return targetOwner;
    }

    return defenders.find((force) => force.kind === 'fleet')?.owner ?? null;
  }

  private resolveForceOwnerId(force: OrbitForceRecord, targetPlanet: Planet): number | null {
    return force.kind === 'orbitingShips' || force.kind === 'planetDefences'
      ? targetPlanet.info.ownerId
      : force.owner?.playerId ?? force.fleet?.ownerId ?? null;
  }

  private toShipAmountRequests(ships: ManyShips): Array<{ type: import('../../enums/ship-type').ShipType; amount: number }> {
    return [...ManyShips.countByType(ships).entries()].map(([type, amount]) => ({
      type,
      amount
    }));
  }

  private toDefenceAmountRequests(defences: ManyDefences): DefenceAmountRequest[] {
    return [...ManyDefences.countByType(defences).entries()].map(([type, amount]) => ({
      type,
      amount
    }));
  }

  private calculateBattleDebris(
    battleResult: SpaceBattleResult,
    overflowShips: ManyShips,
    lostAttackerCargo: ResourcesPack
  ): ResourcesPack {
    const destroyedShipResources = new ResourcesPack(0, 0, 0);
    this.addDestroyedShipResources(destroyedShipResources, battleResult.attacker.destroyedShips);
    this.addDestroyedShipResources(destroyedShipResources, battleResult.defender.destroyedShips);
    this.addDestroyedShipResources(destroyedShipResources, ManyShips.toShipInstances(overflowShips));

    const totalLostResources = new ResourcesPack(
      destroyedShipResources.metal + lostAttackerCargo.metal,
      destroyedShipResources.crystal + lostAttackerCargo.crystal,
      destroyedShipResources.deuterium + lostAttackerCargo.deuterium
    );

    if (totalLostResources.getTotalResourceAmount() <= 0) {
      return new ResourcesPack(0, 0, 0);
    }

    const metalRate = this.randomBetween(0.2, 0.3);
    const crystalRate = this.randomBetween(0.2, 0.3);
    const deuteriumRate = this.randomBetween(0.05, 0.1);

    return new ResourcesPack(
      Math.floor(totalLostResources.metal * metalRate),
      Math.floor(totalLostResources.crystal * crystalRate),
      Math.floor(totalLostResources.deuterium * deuteriumRate)
    );
  }

  private addDestroyedShipResources(
    target: ResourcesPack,
    ships: import('../../fleets/ship-instance').ShipInstance[]
  ): void {
    for (const ship of ships) {
      target.metal += ship.type.cost.metal;
      target.crystal += ship.type.cost.crystal;
      target.deuterium += ship.type.cost.deuterium;
    }
  }

  private calculateDefenceDebris(battleResult: SpaceBattleResult): ResourcesPack {
    const destroyedDefenceResources = new ResourcesPack(0, 0, 0);
    this.addDestroyedDefenceResources(destroyedDefenceResources, battleResult.attacker.destroyedDefences);
    this.addDestroyedDefenceResources(destroyedDefenceResources, battleResult.defender.destroyedDefences);

    if (destroyedDefenceResources.getTotalResourceAmount() <= 0) {
      return destroyedDefenceResources;
    }

    return new ResourcesPack(
      Math.floor(destroyedDefenceResources.metal),
      Math.floor(destroyedDefenceResources.crystal),
      Math.floor(destroyedDefenceResources.deuterium)
    );
  }

  private addDestroyedDefenceResources(
    target: ResourcesPack,
    defences: import('../../defences/defence-instance').DefenceInstance[]
  ): void {
    for (const defence of defences) {
      target.metal += defence.type.cost.metal;
      target.crystal += defence.type.cost.crystal;
      target.deuterium += defence.type.cost.deuterium;
    }
  }

  private randomBetween(min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return min + Math.random() * (max - min);
  }
}
