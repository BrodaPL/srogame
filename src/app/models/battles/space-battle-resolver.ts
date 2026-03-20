import { ShipType } from '../enums/ship-type';
import { TechnologyType } from '../enums/technology-type';
import { WeaponType } from '../enums/weapon-type';
import { ShipInstance } from '../fleets/ship-instance';
import { Player } from '../player';
import { FleetReport } from '../reports/fleet-report';
import type { ReportCoordinates } from '../reports/report-coordinates';

export type BattleSideId = 'attacker' | 'defender';
export type BattleWinner = 'Attacker' | 'Defender' | 'Draw';
export type BattleDestructionReason = 'zeroHull' | 'criticalExplosion';

export type BattleSideInput = {
  player: Player;
  ships: ShipInstance[];
  label?: string;
};

export type SpaceBattleReportContext = {
  createdTurn: number;
  sourceCoordinates?: ReportCoordinates | null;
  sourcePlanetName?: string | null;
  sourceSystemName?: string | null;
};

export type SpaceBattleInput = {
  attacker: BattleSideInput;
  defender: BattleSideInput;
  reportContext: SpaceBattleReportContext;
  maxRounds?: number;
  randomSource?: BattleRandomSource;
};

export type BattleRandomSource = {
  nextFloat(): number;
};

export type BattleShotSummary = {
  side: BattleSideId;
  shooterShipType: ShipType;
  targetShipType: ShipType;
  weaponType: WeaponType;
  weaponDamage: number;
  evaded: boolean;
  targetEvasionChance: number;
  shieldBefore: number;
  shieldAfter: number;
  hullBefore: number;
  hullAfter: number;
  shieldDamage: number;
  hullDamage: number;
};

export type BattleDestroyedShipSummary = {
  side: BattleSideId;
  shipType: ShipType;
  reason: BattleDestructionReason;
  hullBeforeCheck: number;
  criticalHullThreshold: number;
  destructionChancePercent: number;
};

export type BattleRoundSummary = {
  roundNumber: number;
  attackerActiveShips: number;
  defenderActiveShips: number;
  attackerWeapons: number;
  defenderWeapons: number;
  attackerShots: number;
  defenderShots: number;
  shots: BattleShotSummary[];
  destroyedShips: BattleDestroyedShipSummary[];
};

export type BattleShipTypeSummary = {
  shipType: ShipType;
  initial: number;
  surviving: number;
  destroyed: number;
  survivingHull: number;
  survivingShield: number;
};

export type BattleFleetSummary = {
  label: string;
  initialShipCount: number;
  survivingShipCount: number;
  destroyedShipCount: number;
  ships: ShipInstance[];
  survivingShips: ShipInstance[];
  destroyedShips: ShipInstance[];
  byType: BattleShipTypeSummary[];
};

export type SpaceBattleReports = {
  attacker: FleetReport;
  defender: FleetReport;
};

export type SpaceBattleResult = {
  winner: BattleWinner;
  roundsFought: number;
  maxRounds: number;
  attacker: BattleFleetSummary;
  defender: BattleFleetSummary;
  roundSummaries: BattleRoundSummary[];
  reports: SpaceBattleReports;
};

type BattleShipState = {
  ship: ShipInstance;
  effectiveHullCapacity: number;
  effectiveShieldCapacity: number;
  effectiveArmor: number;
  effectiveCriticalThreshold: number;
  effectiveEvasionChance: number;
  queuedWeapons: BattleQueuedWeapon[];
  hullDamagedThisRound: boolean;
};

type BattleQueuedWeapon = {
  type: WeaponType;
  dmg: number;
};

type BattleSideState = {
  id: BattleSideId;
  label: string;
  player: Player;
  techModifiers: BattleTechModifiers;
  ships: BattleShipState[];
};

type BattleTechModifiers = {
  beamDamageMultiplier: number;
  missileDamageMultiplier: number;
  railGunDamageMultiplier: number;
  shieldCapacityMultiplier: number;
  hullCapacityMultiplier: number;
  armorMultiplier: number;
  criticalThresholdReduction: number;
  evasionMultiplier: number;
};

const COMBAT_WEAPON_TYPES = new Set<WeaponType>([
  WeaponType.BEAM,
  WeaponType.MISSILE,
  WeaponType.RAIL_GUN
]);

const mathRandomSource: BattleRandomSource = {
  nextFloat: () => Math.random()
};

export class SpaceBattleResolver {
  public static readonly DEFAULT_MAX_ROUNDS = 4;

  public resolve(input: SpaceBattleInput): SpaceBattleResult {
    const maxRounds = this.normalizeMaxRounds(input.maxRounds);
    const randomSource = input.randomSource ?? mathRandomSource;
    const attacker = this.createSideState('attacker', input.attacker);
    const defender = this.createSideState('defender', input.defender);
    const roundSummaries: BattleRoundSummary[] = [];

    for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber += 1) {
      if (!this.hasAliveShips(attacker) || !this.hasAliveShips(defender)) {
        break;
      }

      this.shuffle(attacker.ships, randomSource);
      this.shuffle(defender.ships, randomSource);

      const roundSummary: BattleRoundSummary = {
        roundNumber,
        attackerActiveShips: this.countAliveShips(attacker),
        defenderActiveShips: this.countAliveShips(defender),
        attackerWeapons: this.refillRoundWeapons(attacker),
        defenderWeapons: this.refillRoundWeapons(defender),
        attackerShots: 0,
        defenderShots: 0,
        shots: [],
        destroyedShips: []
      };

      this.resolveRound(attacker, defender, roundSummary, randomSource);
      this.resolveDestroyedShips(attacker, roundSummary, randomSource);
      this.resolveDestroyedShips(defender, roundSummary, randomSource);

      roundSummaries.push(roundSummary);

      if (!this.hasAliveShips(attacker) || !this.hasAliveShips(defender)) {
        break;
      }
    }

    const attackerSummary = this.buildFleetSummary(attacker, input.attacker.ships);
    const defenderSummary = this.buildFleetSummary(defender, input.defender.ships);
    const winner = this.resolveWinner(attackerSummary, defenderSummary);
    const resultWithoutReports = {
      winner,
      roundsFought: roundSummaries.length,
      maxRounds,
      attacker: attackerSummary,
      defender: defenderSummary,
      roundSummaries
    };
    const reports = this.createReports(
      resultWithoutReports,
      input.reportContext,
      attacker.player,
      defender.player
    );

    attacker.player.addReport(reports.attacker);
    defender.player.addReport(reports.defender);

    return {
      ...resultWithoutReports,
      reports
    };
  }

  private createSideState(id: BattleSideId, input: BattleSideInput): BattleSideState {
    const techModifiers = this.resolveTechModifiers(input.player);

    return {
      id,
      label: input.label?.trim() || input.player.playerName,
      player: input.player,
      techModifiers,
      ships: input.ships.map((ship) => this.createBattleShipState(ship, techModifiers))
    };
  }

  private createBattleShipState(
    ship: ShipInstance,
    techModifiers: BattleTechModifiers
  ): BattleShipState {
    const effectiveHullCapacity = ship.type.hullPointsCapacity * techModifiers.hullCapacityMultiplier;
    const effectiveShieldCapacity = ship.type.shieldCapacity * techModifiers.shieldCapacityMultiplier;
    const effectiveArmor = ship.type.armor * techModifiers.armorMultiplier;
    const effectiveCriticalThreshold = Math.max(
      0,
      ship.type.criticalThreshold - techModifiers.criticalThresholdReduction
    );
    const effectiveEvasionChance = Math.max(
      0,
      Math.min(1, ship.type.evasionChance * techModifiers.evasionMultiplier)
    );

    return {
      ship: new ShipInstance(
        ship.type,
        this.scaleStatToEffectiveCapacity(ship.hull, ship.type.hullPointsCapacity, effectiveHullCapacity),
        this.scaleStatToEffectiveCapacity(ship.shield, ship.type.shieldCapacity, effectiveShieldCapacity),
        ship.cargo,
        ship.hangar.map((nestedShip) => this.createBattleShipState(nestedShip, techModifiers).ship)
      ),
      effectiveHullCapacity,
      effectiveShieldCapacity,
      effectiveArmor,
      effectiveCriticalThreshold,
      effectiveEvasionChance,
      queuedWeapons: [],
      hullDamagedThisRound: false
    };
  }

  private scaleStatToEffectiveCapacity(
    currentValue: number,
    baseCapacity: number,
    effectiveCapacity: number
  ): number {
    if (!Number.isFinite(currentValue) || currentValue <= 0 || effectiveCapacity <= 0) {
      return 0;
    }

    if (!Number.isFinite(baseCapacity) || baseCapacity <= 0) {
      return Math.min(currentValue, effectiveCapacity);
    }

    const ratio = Math.max(0, Math.min(1, currentValue / baseCapacity));
    return effectiveCapacity * ratio;
  }

  private resolveTechModifiers(player: Player): BattleTechModifiers {
    return {
      beamDamageMultiplier: 1 + (player.getTechLevel(TechnologyType.BEAMS_WEAPONS) * 10) / 100,
      missileDamageMultiplier: 1 + (player.getTechLevel(TechnologyType.MISSILES_WEAPONS) * 10) / 100,
      railGunDamageMultiplier: 1 + (player.getTechLevel(TechnologyType.RAILGUNS_WEAPONS) * 10) / 100,
      shieldCapacityMultiplier: 1 + (player.getTechLevel(TechnologyType.SHIELDING_TECHNOLOGY) * 10) / 100,
      hullCapacityMultiplier: 1 + (player.getTechLevel(TechnologyType.ARMOUR_TECHNOLOGY) * 10) / 100,
      armorMultiplier: 1 + (player.getTechLevel(TechnologyType.MATERIAL_TECHNOLOGY) * 5) / 100,
      criticalThresholdReduction: player.getTechLevel(TechnologyType.ARMOUR_TECHNOLOGY),
      evasionMultiplier: 1
        + (player.getTechLevel(TechnologyType.GRAVITON_TECHNOLOGY) * 5) / 100
        + (player.getTechLevel(TechnologyType.FUSION_DRIVE) * 3) / 100
    };
  }

  private normalizeMaxRounds(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return SpaceBattleResolver.DEFAULT_MAX_ROUNDS;
    }

    return Math.max(
      1,
      Math.min(SpaceBattleResolver.DEFAULT_MAX_ROUNDS, Math.floor(value as number))
    );
  }

  private resolveRound(
    attacker: BattleSideState,
    defender: BattleSideState,
    roundSummary: BattleRoundSummary,
    randomSource: BattleRandomSource
  ): void {
    let activeSide: BattleSideId = 'defender';
    let consecutiveSkips = 0;

    while (consecutiveSkips < 2) {
      const shootingSide = activeSide === 'attacker' ? attacker : defender;
      const targetSide = activeSide === 'attacker' ? defender : attacker;
      const didFire = this.fireNextShot(
        activeSide,
        shootingSide,
        targetSide,
        roundSummary,
        randomSource
      );

      if (didFire) {
        consecutiveSkips = 0;
      } else {
        consecutiveSkips += 1;
      }

      activeSide = activeSide === 'attacker' ? 'defender' : 'attacker';
    }
  }

  private fireNextShot(
    side: BattleSideId,
    shootingSide: BattleSideState,
    targetSide: BattleSideState,
    roundSummary: BattleRoundSummary,
    randomSource: BattleRandomSource
  ): boolean {
    const shooter = shootingSide.ships.find((ship) => ship.ship.hull > 0 && ship.queuedWeapons.length > 0);
    if (!shooter) {
      return false;
    }

    const aliveTargets = targetSide.ships.filter((ship) => ship.ship.hull > 0);
    if (aliveTargets.length === 0) {
      return false;
    }

    const weapon = shooter.queuedWeapons.shift();
    if (!weapon) {
      return false;
    }

    const targetIndex = this.randomIndex(aliveTargets.length, randomSource);
    const target = aliveTargets[targetIndex];
    const shotSummary = this.applyWeaponDamage(side, shooter, target, weapon, randomSource);
    roundSummary.shots.push(shotSummary);

    if (side === 'attacker') {
      roundSummary.attackerShots += 1;
    } else {
      roundSummary.defenderShots += 1;
    }

    return true;
  }

  private applyWeaponDamage(
    side: BattleSideId,
    shooter: BattleShipState,
    target: BattleShipState,
    weapon: BattleQueuedWeapon,
    randomSource: BattleRandomSource
  ): BattleShotSummary {
    const shieldBefore = target.ship.shield;
    const hullBefore = target.ship.hull;
    const evaded = this.rollEvade(target.effectiveEvasionChance, randomSource);
    let shieldDamage = 0;
    let hullDamage = 0;

    if (!evaded) {
      if (weapon.type === WeaponType.RAIL_GUN) {
        hullDamage = Math.max(0, weapon.dmg);
      } else {
        shieldDamage = Math.min(Math.max(0, shieldBefore), Math.max(0, weapon.dmg));
        const spilloverDamage = Math.max(0, weapon.dmg - shieldDamage) / 2;
        const armourPenalty = target.effectiveArmor * (weapon.type === WeaponType.MISSILE ? 2 : 1);
        hullDamage = Math.max(0, spilloverDamage - armourPenalty);
        target.ship.shield = Math.max(0, shieldBefore - shieldDamage);
      }

      target.ship.hull -= hullDamage;
      if (hullDamage > 0) {
        target.hullDamagedThisRound = true;
      }
    }

    if (weapon.type === WeaponType.RAIL_GUN) {
      target.ship.shield = shieldBefore;
    }

    return {
      side,
      shooterShipType: shooter.ship.type.type,
      targetShipType: target.ship.type.type,
      weaponType: weapon.type,
      weaponDamage: weapon.dmg,
      evaded,
      targetEvasionChance: target.effectiveEvasionChance,
      shieldBefore,
      shieldAfter: target.ship.shield,
      hullBefore,
      hullAfter: target.ship.hull,
      shieldDamage,
      hullDamage
    };
  }

  private resolveDestroyedShips(
    side: BattleSideState,
    roundSummary: BattleRoundSummary,
    randomSource: BattleRandomSource
  ): void {
    for (const shipState of side.ships) {
      if (!shipState.hullDamagedThisRound) {
        continue;
      }

      if (shipState.ship.hull <= 0) {
        roundSummary.destroyedShips.push({
          side: side.id,
          shipType: shipState.ship.type.type,
          reason: 'zeroHull',
          hullBeforeCheck: shipState.ship.hull,
          criticalHullThreshold: this.criticalHullThreshold(shipState),
          destructionChancePercent: 100
        });
        this.destroyShip(shipState);
        continue;
      }

      const criticalHullThreshold = this.criticalHullThreshold(shipState);
      if (criticalHullThreshold <= 0 || shipState.ship.hull > criticalHullThreshold) {
        continue;
      }

      const destructionChancePercent = this.destructionChancePercent(shipState.ship, criticalHullThreshold);
      if (!this.rollCriticalDestruction(destructionChancePercent, randomSource)) {
        continue;
      }

      roundSummary.destroyedShips.push({
        side: side.id,
        shipType: shipState.ship.type.type,
        reason: 'criticalExplosion',
        hullBeforeCheck: shipState.ship.hull,
        criticalHullThreshold,
        destructionChancePercent
      });
      this.destroyShip(shipState);
    }
  }

  private destroyShip(shipState: BattleShipState): void {
    shipState.ship.hull = 0;
    shipState.ship.shield = 0;
    shipState.queuedWeapons = [];
  }

  private criticalHullThreshold(shipState: BattleShipState): number {
    return shipState.effectiveHullCapacity * (shipState.effectiveCriticalThreshold / 100);
  }

  private destructionChancePercent(ship: ShipInstance, criticalHullThreshold: number): number {
    if (criticalHullThreshold <= 0 || ship.hull >= criticalHullThreshold) {
      return 0;
    }

    const rawChance = ((criticalHullThreshold - ship.hull) / criticalHullThreshold) * 100;
    return Math.max(0, Math.min(100, Math.round(rawChance)));
  }

  private rollCriticalDestruction(
    destructionChancePercent: number,
    randomSource: BattleRandomSource
  ): boolean {
    if (destructionChancePercent <= 0) {
      return false;
    }

    if (destructionChancePercent >= 100) {
      return true;
    }

    return this.nextRandomFloat(randomSource) < destructionChancePercent / 100;
  }

  private rollEvade(evasionChance: number, randomSource: BattleRandomSource): boolean {
    if (evasionChance <= 0) {
      return false;
    }

    if (evasionChance >= 1) {
      return true;
    }

    return this.nextRandomFloat(randomSource) < evasionChance;
  }

  private refillRoundWeapons(side: BattleSideState): number {
    let weaponsCount = 0;

    for (const shipState of side.ships) {
      shipState.hullDamagedThisRound = false;
      if (shipState.ship.hull <= 0) {
        shipState.queuedWeapons = [];
        continue;
      }

      shipState.queuedWeapons = this.expandCombatWeapons(shipState.ship, side.techModifiers);
      weaponsCount += shipState.queuedWeapons.length;
    }

    return weaponsCount;
  }

  private expandCombatWeapons(
    ship: ShipInstance,
    techModifiers: BattleTechModifiers
  ): BattleQueuedWeapon[] {
    const weapons: BattleQueuedWeapon[] = [];

    for (const weapon of ship.type.weapons) {
      if (!COMBAT_WEAPON_TYPES.has(weapon.type)) {
        continue;
      }

      const shots = Math.max(0, Math.floor(weapon.shots));
      for (let shot = 0; shot < shots; shot += 1) {
        weapons.push({
          type: weapon.type,
          dmg: this.modifiedWeaponDamage(weapon.type, weapon.dmg, techModifiers)
        });
      }
    }

    return weapons;
  }

  private modifiedWeaponDamage(
    weaponType: WeaponType,
    baseDamage: number,
    techModifiers: BattleTechModifiers
  ): number {
    if (weaponType === WeaponType.BEAM) {
      return baseDamage * techModifiers.beamDamageMultiplier;
    }

    if (weaponType === WeaponType.MISSILE) {
      return baseDamage * techModifiers.missileDamageMultiplier;
    }

    if (weaponType === WeaponType.RAIL_GUN) {
      return baseDamage * techModifiers.railGunDamageMultiplier;
    }

    return baseDamage;
  }

  private buildFleetSummary(side: BattleSideState, initialShips: ShipInstance[]): BattleFleetSummary {
    const ships = side.ships.map((shipState) => shipState.ship);
    const survivingShips = ships.filter((ship) => ship.hull > 0);
    const destroyedShips = ships.filter((ship) => ship.hull <= 0);

    return {
      label: side.label,
      initialShipCount: initialShips.length,
      survivingShipCount: survivingShips.length,
      destroyedShipCount: destroyedShips.length,
      ships,
      survivingShips,
      destroyedShips,
      byType: this.buildShipTypeSummary(initialShips, ships)
    };
  }

  private buildShipTypeSummary(
    initialShips: ShipInstance[],
    finalShips: ShipInstance[]
  ): BattleShipTypeSummary[] {
    const order = new Map<ShipType, number>();
    initialShips.forEach((ship, index) => {
      if (!order.has(ship.type.type)) {
        order.set(ship.type.type, index);
      }
    });

    const stats = new Map<ShipType, BattleShipTypeSummary>();
    for (const ship of initialShips) {
      const current = stats.get(ship.type.type) ?? {
        shipType: ship.type.type,
        initial: 0,
        surviving: 0,
        destroyed: 0,
        survivingHull: 0,
        survivingShield: 0
      };

      current.initial += 1;
      stats.set(ship.type.type, current);
    }

    for (const ship of finalShips) {
      const current = stats.get(ship.type.type);
      if (!current) {
        continue;
      }

      if (ship.hull > 0) {
        current.surviving += 1;
        current.survivingHull += ship.hull;
        current.survivingShield += ship.shield;
      } else {
        current.destroyed += 1;
      }
    }

    return [...stats.values()].sort((left, right) => {
      const leftOrder = order.get(left.shipType) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right.shipType) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
  }

  private resolveWinner(attacker: BattleFleetSummary, defender: BattleFleetSummary): BattleWinner {
    if (attacker.survivingShipCount > 0 && defender.survivingShipCount === 0) {
      return 'Attacker';
    }

    if (defender.survivingShipCount > 0 && attacker.survivingShipCount === 0) {
      return 'Defender';
    }

    if (attacker.survivingShipCount > defender.survivingShipCount) {
      return 'Attacker';
    }

    if (defender.survivingShipCount > attacker.survivingShipCount) {
      return 'Defender';
    }

    return 'Draw';
  }

  private createReports(
    result: Omit<SpaceBattleResult, 'reports'>,
    reportContext: SpaceBattleReportContext,
    attackerPlayer: Player,
    defenderPlayer: Player
  ): SpaceBattleReports {
    const title = this.createReportTitle(result, reportContext.sourceCoordinates);

    return {
      attacker: new FleetReport(
        {
          reportId: attackerPlayer.createReportId(),
          createdTurn: reportContext.createdTurn,
          title,
          sourceCoordinates: reportContext.sourceCoordinates ?? null,
          sourcePlanetName: reportContext.sourcePlanetName ?? null,
          sourceSystemName: reportContext.sourceSystemName ?? null
        },
        this.buildReportBody(result, 'attacker')
      ),
      defender: new FleetReport(
        {
          reportId: defenderPlayer.createReportId(),
          createdTurn: reportContext.createdTurn,
          title,
          sourceCoordinates: reportContext.sourceCoordinates ?? null,
          sourcePlanetName: reportContext.sourcePlanetName ?? null,
          sourceSystemName: reportContext.sourceSystemName ?? null
        },
        this.buildReportBody(result, 'defender')
      )
    };
  }

  private buildReportBody(
    result: Omit<SpaceBattleResult, 'reports'>,
    perspective: BattleSideId
  ): string {
    const ownSide = perspective === 'attacker' ? result.attacker : result.defender;
    const enemySide = perspective === 'attacker' ? result.defender : result.attacker;
    const lines = [
      `Battle result: ${result.winner}`,
      `Perspective: ${ownSide.label}`,
      `Rounds fought: ${result.roundsFought} / ${result.maxRounds}`,
      `Own fleet (${ownSide.label}): ${ownSide.survivingShipCount}/${ownSide.initialShipCount} survived, ${ownSide.destroyedShipCount} lost.`,
      `Enemy fleet (${enemySide.label}): ${enemySide.survivingShipCount}/${enemySide.initialShipCount} survived, ${enemySide.destroyedShipCount} lost.`,
      `Own survivors by type: ${this.formatTypeSummary(ownSide.byType, 'surviving')}`,
      `Enemy survivors by type: ${this.formatTypeSummary(enemySide.byType, 'surviving')}`,
      'Round summaries:'
    ];

    for (const round of result.roundSummaries) {
      lines.push(
        `Round ${round.roundNumber}: `
        + `${result.attacker.label} shots ${round.attackerShots}, `
        + `${result.defender.label} shots ${round.defenderShots}, `
        + `${result.attacker.label} losses ${this.countDestroyedShips(round, 'attacker')}, `
        + `${result.defender.label} losses ${this.countDestroyedShips(round, 'defender')}.`
      );
    }

    if (result.roundSummaries.length === 0) {
      lines.push('No rounds were fought.');
    }

    return lines.join('\n');
  }

  private createReportTitle(
    result: Omit<SpaceBattleResult, 'reports'>,
    coordinates: ReportCoordinates | null | undefined
  ): string {
    if (coordinates) {
      return `Battle Report: ${coordinates.x}:${coordinates.y}:${coordinates.z}`;
    }

    return `Battle Report: ${result.attacker.label} vs ${result.defender.label}`;
  }

  private formatTypeSummary(
    summaries: BattleShipTypeSummary[],
    key: 'surviving' | 'destroyed'
  ): string {
    const filtered = summaries
      .filter((summary) => summary[key] > 0)
      .map((summary) => `${summary.shipType} x${summary[key]}`);

    return filtered.length > 0 ? filtered.join(', ') : 'none';
  }

  private countDestroyedShips(round: BattleRoundSummary, side: BattleSideId): number {
    return round.destroyedShips.filter((entry) => entry.side === side).length;
  }

  private hasAliveShips(side: BattleSideState): boolean {
    return side.ships.some((ship) => ship.ship.hull > 0);
  }

  private countAliveShips(side: BattleSideState): number {
    return side.ships.filter((ship) => ship.ship.hull > 0).length;
  }

  private shuffle<T>(items: T[], randomSource: BattleRandomSource): void {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const targetIndex = Math.floor(this.nextRandomFloat(randomSource) * (index + 1));
      [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    }
  }

  private randomIndex(length: number, randomSource: BattleRandomSource): number {
    if (length <= 1) {
      return 0;
    }

    return Math.min(length - 1, Math.floor(this.nextRandomFloat(randomSource) * length));
  }

  private nextRandomFloat(randomSource: BattleRandomSource): number {
    const raw = randomSource.nextFloat();
    if (!Number.isFinite(raw)) {
      return 0;
    }

    return Math.min(0.999999999999, Math.max(0, raw));
  }
}
