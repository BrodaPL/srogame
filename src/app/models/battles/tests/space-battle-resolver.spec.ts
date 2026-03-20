import { describe, expect, it } from 'vitest';
import { HullClass } from '../../enums/hull-class';
import { PlayerType } from '../../enums/player-type';
import { ShipType } from '../../enums/ship-type';
import { TechnologyType } from '../../enums/technology-type';
import { WeaponType } from '../../enums/weapon-type';
import { Ship } from '../../fleets/ship';
import { ShipInstance } from '../../fleets/ship-instance';
import { Weapon } from '../../fleets/weapon';
import { Player } from '../../player';
import { FleetReport } from '../../reports/fleet-report';
import { ResourcesPack } from '../../resources-pack';
import {
  SpaceBattleResolver,
  type BattleRandomSource,
  type BattleFleetSummary,
  type BattleRoundSummary,
  type SpaceBattleResult
} from '../space-battle-resolver';

describe('SpaceBattleResolver', () => {
  class SequenceRandomSource implements BattleRandomSource {
    private index = 0;

    constructor(private readonly values: number[]) {}

    nextFloat(): number {
      const value = this.values[this.index] ?? this.values[this.values.length - 1] ?? 0;
      this.index += 1;
      return value;
    }
  }

  const createPlayer = (
    playerId: number,
    playerName: string,
    techLevels: Partial<Record<TechnologyType, number>> = {}
  ): Player => new Player(
    playerId,
    playerName,
    [],
    new Map(
      Object.entries(techLevels)
        .filter((entry) => Number.isFinite(entry[1]) && Number(entry[1]) > 0)
        .map(([technologyType, level]) => [technologyType as TechnologyType, Math.floor(Number(level))])
    ),
    [],
    PlayerType.PLAYER
  );

  const createShip = (
    type: ShipType,
    weapons: Weapon[],
    {
      hullPointsCapacity = 100,
      criticalThreshold = 30,
      shieldCapacity = 0,
      armor = 0
    }: {
      hullPointsCapacity?: number;
      criticalThreshold?: number;
      shieldCapacity?: number;
      armor?: number;
    } = {}
  ): Ship => new Ship(
    type,
    '',
    HullClass.SMALL,
    false,
    1,
    0,
    hullPointsCapacity,
    criticalThreshold,
    shieldCapacity,
    armor,
    weapons,
    0,
    0,
    new Set(),
    0,
    new ResourcesPack(0, 0, 0),
    [],
    []
  );

  const createShipInstance = (
    ship: Ship,
    hull = ship.hullPointsCapacity,
    shield = ship.shieldCapacity
  ): ShipInstance => new ShipInstance(ship, hull, shield, 0, []);

  const createFleet = (
    ship: Ship,
    amount: number,
    hull = ship.hullPointsCapacity,
    shield = ship.shieldCapacity
  ): ShipInstance[] => Array.from(
    { length: amount },
    () => createShipInstance(ship, hull, shield)
  );

  const logFleetSummary = (
    battleLabel: string,
    side: 'attacker' | 'defender',
    summary: BattleFleetSummary
  ): void => {
    console.log(`[${battleLabel}] ${side.toUpperCase()} final summary`);
    console.log(
      `[${battleLabel}] ${side} counts | initial=${summary.initialShipCount} surviving=${summary.survivingShipCount} destroyed=${summary.destroyedShipCount}`
    );

    summary.byType.forEach((entry, index) => {
      console.log(
        `[${battleLabel}] ${side} type[${index}] ${entry.shipType} | initial=${entry.initial} surviving=${entry.surviving} destroyed=${entry.destroyed} survivingHull=${entry.survivingHull} survivingShield=${entry.survivingShield}`
      );
    });

    summary.ships.forEach((ship, index) => {
      console.log(
        `[${battleLabel}] ${side} ship[${index}] ${ship.type.type} | hull=${ship.hull} shield=${ship.shield}`
      );
    });
  };

  const logRoundSummary = (battleLabel: string, round: BattleRoundSummary): void => {
    console.log(
      `[${battleLabel}] round ${round.roundNumber} start | attackerActive=${round.attackerActiveShips} defenderActive=${round.defenderActiveShips} attackerWeapons=${round.attackerWeapons} defenderWeapons=${round.defenderWeapons}`
    );

    if (round.shots.length === 0) {
      console.log(`[${battleLabel}] round ${round.roundNumber} shots | none`);
    } else {
      round.shots.forEach((shot, index) => {
        console.log(
          `[${battleLabel}] round ${round.roundNumber} shot ${index + 1} | side=${shot.side} shooter=${shot.shooterShipType} target=${shot.targetShipType} weapon=${shot.weaponType} shield ${shot.shieldBefore}->${shot.shieldAfter} (-${shot.shieldDamage}) hull ${shot.hullBefore}->${shot.hullAfter} (-${shot.hullDamage})`
          + ` baseDamage=${shot.weaponDamage} evaded=${shot.evaded} targetEvasion=${(shot.targetEvasionChance * 100).toFixed(2)}%`
        );
      });
    }

    if (round.destroyedShips.length === 0) {
      console.log(`[${battleLabel}] round ${round.roundNumber} destroyed | none`);
    } else {
      round.destroyedShips.forEach((entry, index) => {
        console.log(
          `[${battleLabel}] round ${round.roundNumber} destroyed ${index + 1} | side=${entry.side} ship=${entry.shipType} reason=${entry.reason} hullBeforeCheck=${entry.hullBeforeCheck} criticalThreshold=${entry.criticalHullThreshold} chance=${entry.destructionChancePercent}%`
        );
      });
    }

    console.log(
      `[${battleLabel}] round ${round.roundNumber} end | attackerShots=${round.attackerShots} defenderShots=${round.defenderShots}`
    );
  };

  const logBattleResult = (battleLabel: string, result: SpaceBattleResult): void => {
    console.log(`[${battleLabel}] battle start`);
    console.log(
      `[${battleLabel}] result | winner=${result.winner} roundsFought=${result.roundsFought}/${result.maxRounds}`
    );

    result.roundSummaries.forEach((round) => logRoundSummary(battleLabel, round));
    logFleetSummary(battleLabel, 'attacker', result.attacker);
    logFleetSummary(battleLabel, 'defender', result.defender);
  };

  const logLargeBattleResult = (battleLabel: string, result: SpaceBattleResult): void => {
    console.log(`[${battleLabel}] large battle start`);
    console.log(
      `[${battleLabel}] result | winner=${result.winner} roundsFought=${result.roundsFought}/${result.maxRounds}`
    );

    result.roundSummaries.forEach((round) => {
      console.log(
        `[${battleLabel}] round ${round.roundNumber} aggregate | attackerActive=${round.attackerActiveShips} defenderActive=${round.defenderActiveShips} attackerWeapons=${round.attackerWeapons} defenderWeapons=${round.defenderWeapons} attackerShots=${round.attackerShots} defenderShots=${round.defenderShots} destroyed=${round.destroyedShips.length}`
      );

      const sampleShots = round.shots.slice(0, 5);
      sampleShots.forEach((shot, index) => {
        console.log(
          `[${battleLabel}] round ${round.roundNumber} sample shot ${index + 1} | side=${shot.side} shooter=${shot.shooterShipType} target=${shot.targetShipType} weapon=${shot.weaponType} shield ${shot.shieldBefore}->${shot.shieldAfter} hull ${shot.hullBefore}->${shot.hullAfter}`
          + ` baseDamage=${shot.weaponDamage} evaded=${shot.evaded} targetEvasion=${(shot.targetEvasionChance * 100).toFixed(2)}%`
        );
      });

      if (round.shots.length > sampleShots.length) {
        console.log(
          `[${battleLabel}] round ${round.roundNumber} additional shots omitted=${round.shots.length - sampleShots.length}`
        );
      }

      round.destroyedShips.slice(0, 10).forEach((entry, index) => {
        console.log(
          `[${battleLabel}] round ${round.roundNumber} destroyed ${index + 1} | side=${entry.side} ship=${entry.shipType} reason=${entry.reason} hullBeforeCheck=${entry.hullBeforeCheck} chance=${entry.destructionChancePercent}%`
        );
      });

      if (round.destroyedShips.length > 10) {
        console.log(
          `[${battleLabel}] round ${round.roundNumber} additional destroyed entries omitted=${round.destroyedShips.length - 10}`
        );
      }
    });

    logFleetSummary(battleLabel, 'attacker', result.attacker);
    logFleetSummary(battleLabel, 'defender', result.defender);
  };

  it('applies missile shield spillover first and armor only to the HP damage', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const missileShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.MISSILE, 100, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { shieldCapacity: 8, armor: 3 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(missileShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-missile-spillover', result);

    expect(result.roundSummaries).toHaveLength(1);
    expect(result.roundSummaries[0].shots).toHaveLength(1);
    expect(result.roundSummaries[0].shots[0].shieldDamage).toBe(8);
    expect(result.roundSummaries[0].shots[0].hullDamage).toBe(40);
    expect(result.defender.ships[0].shield).toBe(0);
    expect(result.defender.ships[0].hull).toBe(60);
  });

  it('applies beam damage with the same spillover rule and lower armor penalty', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const beamShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 30, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { shieldCapacity: 10, armor: 3 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(beamShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-beam-spillover', result);

    expect(result.roundSummaries[0].shots[0].shieldDamage).toBe(10);
    expect(result.roundSummaries[0].shots[0].hullDamage).toBe(7);
    expect(result.defender.ships[0].hull).toBe(93);
  });

  it('lets rail guns ignore shields and armor entirely', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const railGunShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.RAIL_GUN, 20, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { shieldCapacity: 50, armor: 99 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(railGunShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-rail-gun', result);

    expect(result.roundSummaries[0].shots[0].shieldDamage).toBe(0);
    expect(result.roundSummaries[0].shots[0].hullDamage).toBe(20);
    expect(result.defender.ships[0].shield).toBe(50);
    expect(result.defender.ships[0].hull).toBe(80);
  });

  it('applies weapon technology modifiers to the base damage before battle damage is resolved', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker', {
      [TechnologyType.BEAMS_WEAPONS]: 2
    });
    const defender = createPlayer(2, 'Defender');
    const beamShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 50, 1)]
    );
    const targetShip = createShip(ShipType.CRUISER, []);

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(beamShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-weapon-tech-bonus', result);

    expect(result.roundSummaries[0].shots[0].weaponDamage).toBe(60);
    expect(result.roundSummaries[0].shots[0].hullDamage).toBe(30);
    expect(result.defender.ships[0].hull).toBe(70);
  });

  it('scales shield and hull capacities from shielding and armour technologies', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender', {
      [TechnologyType.SHIELDING_TECHNOLOGY]: 1,
      [TechnologyType.ARMOUR_TECHNOLOGY]: 2
    });
    const supportShip = createShip(ShipType.FIGHTER, []);
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { hullPointsCapacity: 100, shieldCapacity: 20 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(supportShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-tech-capacity-scaling', result);

    expect(result.roundSummaries[0].shots).toHaveLength(0);
    expect(result.defender.ships[0].hull).toBe(120);
    expect(result.defender.ships[0].shield).toBe(22);
  });

  it('applies material technology to armor mitigation after shield spillover', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender', {
      [TechnologyType.MATERIAL_TECHNOLOGY]: 2
    });
    const beamShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 30, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { armor: 10 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(beamShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-material-tech-armor', result);

    expect(result.roundSummaries[0].shots[0].hullDamage).toBe(4);
    expect(result.defender.ships[0].hull).toBe(96);
  });

  it('alternates shots between defender and attacker after the round refill', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const attackerShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 20, 2)]
    );
    const defenderShip = createShip(
      ShipType.CORVETTE,
      [new Weapon(WeaponType.BEAM, 20, 2)]
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(attackerShip)] },
      defender: { player: defender, ships: [createShipInstance(defenderShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1
    });

    logBattleResult('battle-test-alternating-fire-order', result);

    expect(result.roundSummaries[0].attackerActiveShips).toBe(1);
    expect(result.roundSummaries[0].defenderActiveShips).toBe(1);
    expect(result.roundSummaries[0].attackerWeapons).toBe(2);
    expect(result.roundSummaries[0].defenderWeapons).toBe(2);
    expect(result.roundSummaries[0].shots.map((shot) => shot.side)).toEqual([
      'defender',
      'attacker',
      'defender',
      'attacker'
    ]);
    expect(result.attacker.ships[0].hull).toBe(80);
    expect(result.defender.ships[0].hull).toBe(80);
  });

  it('checks critical destruction after the round when damaged hull drops under the threshold', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const beamShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 20, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { hullPointsCapacity: 100, criticalThreshold: 30 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(beamShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip, 39, 0)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1,
      randomSource: new SequenceRandomSource([0.02])
    });

    logBattleResult('battle-test-critical-explosion', result);

    expect(result.defender.destroyedShipCount).toBe(1);
    expect(result.defender.ships[0].hull).toBe(0);
    expect(result.roundSummaries[0].destroyedShips).toHaveLength(1);
    expect(result.roundSummaries[0].destroyedShips[0].reason).toBe('criticalExplosion');
    expect(result.roundSummaries[0].destroyedShips[0].destructionChancePercent).toBe(3);
  });

  it('reduces effective critical threshold from armour technology before the explosion roll', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender', {
      [TechnologyType.ARMOUR_TECHNOLOGY]: 4
    });
    const beamShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 40, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      [],
      { hullPointsCapacity: 100, criticalThreshold: 30 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(beamShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip, 39, 0)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1,
      randomSource: new SequenceRandomSource([0.04])
    });

    logBattleResult('battle-test-armour-tech-threshold', result);

    expect(result.defender.destroyedShipCount).toBe(1);
    expect(result.roundSummaries[0].destroyedShips).toHaveLength(1);
    expect(result.roundSummaries[0].destroyedShips[0].reason).toBe('criticalExplosion');
    expect(result.roundSummaries[0].destroyedShips[0].criticalHullThreshold).toBeCloseTo(36.4);
    expect(result.roundSummaries[0].destroyedShips[0].destructionChancePercent).toBe(5);
  });

  it('lets evasion technology evade the full shot damage', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender', {
      [TechnologyType.GRAVITON_TECHNOLOGY]: 1,
      [TechnologyType.FUSION_DRIVE]: 3
    });
    const railGunShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.RAIL_GUN, 200, 1)]
    );
    const evasiveShip = createShip(
      ShipType.CRUISER,
      [],
      { hullPointsCapacity: 100, shieldCapacity: 30, armor: 5 }
    );
    evasiveShip.evasionChance = 0.10;

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(railGunShip)] },
      defender: { player: defender, ships: [createShipInstance(evasiveShip)] },
      reportContext: { createdTurn: 7 },
      maxRounds: 1,
      randomSource: new SequenceRandomSource([0.11])
    });

    logBattleResult('battle-test-evasion-tech', result);

    expect(result.roundSummaries[0].shots[0].evaded).toBe(true);
    expect(result.roundSummaries[0].shots[0].targetEvasionChance).toBeCloseTo(0.114);
    expect(result.roundSummaries[0].shots[0].shieldDamage).toBe(0);
    expect(result.roundSummaries[0].shots[0].hullDamage).toBe(0);
    expect(result.defender.ships[0].shield).toBe(30);
    expect(result.defender.ships[0].hull).toBe(100);
  });

  it('creates battle fleet reports for both players', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const railGunShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.RAIL_GUN, 200, 1)]
    );
    const targetShip = createShip(
      ShipType.CRUISER,
      []
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: [createShipInstance(railGunShip)] },
      defender: { player: defender, ships: [createShipInstance(targetShip)] },
      reportContext: {
        createdTurn: 11,
        sourceCoordinates: { x: 4, y: 5, z: 6 },
        sourcePlanetName: 'Target',
        sourceSystemName: 'Sigma'
      }
    });

    logBattleResult('battle-test-reports', result);
    console.log('[battle-test-reports] attacker report body');
    console.log(result.reports.attacker.show());
    console.log('[battle-test-reports] defender report body');
    console.log(result.reports.defender.show());

    expect(result.winner).toBe('Attacker');
    expect(attacker.reports).toHaveLength(1);
    expect(defender.reports).toHaveLength(1);
    expect(attacker.reports[0]).toBeInstanceOf(FleetReport);
    expect(defender.reports[0]).toBeInstanceOf(FleetReport);
    expect(attacker.reports[0].reportId).toBe(1);
    expect(defender.reports[0].reportId).toBe(1);
    expect(attacker.reports[0].title).toBe('Battle Report: 4:5:6');
    expect(attacker.reports[0].show()).toContain('Perspective: Attacker');
    expect(defender.reports[0].show()).toContain('Perspective: Defender');
    expect(attacker.reports[0].show()).toContain('Battle result: Attacker');
  });

  it('simulates a full 4-round battle when armor prevents all hull damage', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const attackerShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 2, 2)],
      { armor: 10 }
    );
    const defenderShip = createShip(
      ShipType.CORVETTE,
      [new Weapon(WeaponType.MISSILE, 2, 2)],
      { armor: 10 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: createFleet(attackerShip, 2) },
      defender: { player: defender, ships: createFleet(defenderShip, 2) },
      reportContext: { createdTurn: 17 },
      randomSource: new SequenceRandomSource([0.999, 0, 0.999, 0, 0.999, 0])
    });

    logBattleResult('battle-test-full-four-rounds', result);

    expect(result.roundsFought).toBe(4);
    expect(result.roundSummaries).toHaveLength(4);
    expect(result.roundSummaries.every((round) => round.attackerShots === 4)).toBe(true);
    expect(result.roundSummaries.every((round) => round.defenderShots === 4)).toBe(true);
    expect(result.attacker.survivingShipCount).toBe(2);
    expect(result.defender.survivingShipCount).toBe(2);
    expect(result.roundSummaries.every((round) => round.destroyedShips.length === 0)).toBe(true);
  });

  it('resolves a multi-ship battle with losses across multiple rounds', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');
    const attackerShip = createShip(
      ShipType.BATTLE_SHIP,
      [new Weapon(WeaponType.RAIL_GUN, 60, 1)],
      { hullPointsCapacity: 100 }
    );
    const defenderShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 10, 1)],
      { hullPointsCapacity: 50 }
    );

    const result = resolver.resolve({
      attacker: { player: attacker, ships: createFleet(attackerShip, 2) },
      defender: { player: defender, ships: createFleet(defenderShip, 3, 50, 0) },
      reportContext: { createdTurn: 23 },
      randomSource: new SequenceRandomSource([0])
    });

    logBattleResult('battle-test-multi-ship', result);

    expect(result.roundsFought).toBe(2);
    expect(result.winner).toBe('Attacker');
    expect(result.attacker.survivingShipCount).toBe(2);
    expect(result.defender.survivingShipCount).toBe(0);
    expect(result.defender.destroyedShipCount).toBe(3);
    expect(result.roundSummaries[0].shots.length).toBe(5);
    expect(result.roundSummaries[0].destroyedShips.length).toBe(2);
    expect(result.roundSummaries[1].destroyedShips.length).toBe(1);
  });

  it('simulates a full 4-round multi-ship battle with technology modifiers and repeated evades', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker', {
      [TechnologyType.BEAMS_WEAPONS]: 1,
      [TechnologyType.SHIELDING_TECHNOLOGY]: 1,
      [TechnologyType.GRAVITON_TECHNOLOGY]: 1,
      [TechnologyType.FUSION_DRIVE]: 3
    });
    const defender = createPlayer(2, 'Defender', {
      [TechnologyType.MISSILES_WEAPONS]: 1,
      [TechnologyType.MATERIAL_TECHNOLOGY]: 2,
      [TechnologyType.GRAVITON_TECHNOLOGY]: 1,
      [TechnologyType.FUSION_DRIVE]: 3
    });
    const attackerShip = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 20, 2)],
      { shieldCapacity: 20, armor: 20 }
    );
    const defenderShip = createShip(
      ShipType.CORVETTE,
      [new Weapon(WeaponType.MISSILE, 20, 2)],
      { shieldCapacity: 20, armor: 20 }
    );
    attackerShip.evasionChance = 0.10;
    defenderShip.evasionChance = 0.10;

    const result = resolver.resolve({
      attacker: { player: attacker, ships: createFleet(attackerShip, 2) },
      defender: { player: defender, ships: createFleet(defenderShip, 2) },
      reportContext: { createdTurn: 19 },
      randomSource: new SequenceRandomSource([0.05])
    });

    logBattleResult('battle-test-tech-evasion-four-rounds', result);

    expect(result.roundsFought).toBe(4);
    expect(result.roundSummaries).toHaveLength(4);
    expect(result.attacker.survivingShipCount).toBe(2);
    expect(result.defender.survivingShipCount).toBe(2);
    expect(result.roundSummaries.every((round) => round.shots.length === 8)).toBe(true);
    expect(result.roundSummaries.every((round) => round.shots.every((shot) => shot.evaded))).toBe(true);
    expect(result.roundSummaries.every((round) => round.destroyedShips.length === 0)).toBe(true);
  });

  it('resolves a large mixed battle with 150 attackers against 250 defenders', () => {
    const resolver = new SpaceBattleResolver();
    const attacker = createPlayer(1, 'Attacker');
    const defender = createPlayer(2, 'Defender');

    const fighter = createShip(
      ShipType.FIGHTER,
      [new Weapon(WeaponType.BEAM, 12, 1)],
      { hullPointsCapacity: 20, criticalThreshold: 35 }
    );
    const assaultFighter = createShip(
      ShipType.ASSAULT_FIGHTER,
      [new Weapon(WeaponType.MISSILE, 18, 2)],
      { hullPointsCapacity: 30, criticalThreshold: 35 }
    );
    const corvette = createShip(
      ShipType.CORVETTE,
      [
        new Weapon(WeaponType.BEAM, 14, 1),
        new Weapon(WeaponType.MISSILE, 18, 1)
      ],
      { hullPointsCapacity: 80, criticalThreshold: 30, shieldCapacity: 20, armor: 2 }
    );
    const cruiser = createShip(
      ShipType.CRUISER,
      [
        new Weapon(WeaponType.BEAM, 18, 1),
        new Weapon(WeaponType.MISSILE, 22, 1),
        new Weapon(WeaponType.RAIL_GUN, 12, 1)
      ],
      { hullPointsCapacity: 100, criticalThreshold: 30, shieldCapacity: 30, armor: 3 }
    );
    const battleShip = createShip(
      ShipType.BATTLE_SHIP,
      [
        new Weapon(WeaponType.BEAM, 24, 1),
        new Weapon(WeaponType.MISSILE, 30, 1)
      ],
      { hullPointsCapacity: 140, criticalThreshold: 28, shieldCapacity: 40, armor: 4 }
    );
    const frigate = createShip(
      ShipType.FRIGATE,
      [
        new Weapon(WeaponType.BEAM, 18, 1),
        new Weapon(WeaponType.MISSILE, 36, 1),
        new Weapon(WeaponType.RAIL_GUN, 12, 2)
      ],
      { hullPointsCapacity: 160, criticalThreshold: 28, shieldCapacity: 50, armor: 4 }
    );
    const battleCruiser = createShip(
      ShipType.BATTLE_CRUISER,
      [
        new Weapon(WeaponType.BEAM, 24, 4),
        new Weapon(WeaponType.MISSILE, 30, 1),
        new Weapon(WeaponType.RAIL_GUN, 14, 1)
      ],
      { hullPointsCapacity: 300, criticalThreshold: 25, shieldCapacity: 80, armor: 6 }
    );
    const destroyer = createShip(
      ShipType.DESTROYER,
      [
        new Weapon(WeaponType.MISSILE, 40, 1),
        new Weapon(WeaponType.RAIL_GUN, 28, 2)
      ],
      { hullPointsCapacity: 250, criticalThreshold: 25, shieldCapacity: 100, armor: 6 }
    );
    const dreadnought = createShip(
      ShipType.DREADNOUGHT,
      [
        new Weapon(WeaponType.BEAM, 30, 1),
        new Weapon(WeaponType.MISSILE, 50, 3)
      ],
      { hullPointsCapacity: 200, criticalThreshold: 24, shieldCapacity: 120, armor: 6 }
    );

    const attackerFleet = [
      ...createFleet(fighter, 40),
      ...createFleet(assaultFighter, 35),
      ...createFleet(corvette, 25),
      ...createFleet(cruiser, 15),
      ...createFleet(battleShip, 12),
      ...createFleet(frigate, 10),
      ...createFleet(battleCruiser, 6),
      ...createFleet(destroyer, 4),
      ...createFleet(dreadnought, 3)
    ];
    const defenderFleet = [
      ...createFleet(fighter, 70),
      ...createFleet(assaultFighter, 55),
      ...createFleet(corvette, 40),
      ...createFleet(cruiser, 25),
      ...createFleet(battleShip, 20),
      ...createFleet(frigate, 15),
      ...createFleet(battleCruiser, 10),
      ...createFleet(destroyer, 8),
      ...createFleet(dreadnought, 7)
    ];

    const result = resolver.resolve({
      attacker: { player: attacker, ships: attackerFleet },
      defender: { player: defender, ships: defenderFleet },
      reportContext: { createdTurn: 30 },
      randomSource: new SequenceRandomSource([0.13, 0.71, 0.29, 0.87, 0.43, 0.57, 0.19, 0.91])
    });

    logLargeBattleResult('battle-test-large-mixed-fleets', result);

    expect(attackerFleet).toHaveLength(150);
    expect(defenderFleet).toHaveLength(250);
    expect(result.roundsFought).toBeGreaterThan(0);
    expect(result.roundsFought).toBeLessThanOrEqual(4);
    expect(result.attacker.initialShipCount).toBe(150);
    expect(result.defender.initialShipCount).toBe(250);
    expect(result.attacker.survivingShipCount + result.attacker.destroyedShipCount).toBe(150);
    expect(result.defender.survivingShipCount + result.defender.destroyedShipCount).toBe(250);
    expect(result.roundSummaries.some((round) => round.shots.length > 100)).toBe(true);
    expect(
      result.attacker.byType.some((entry) => entry.shipType === ShipType.DREADNOUGHT)
    ).toBe(true);
    expect(
      result.defender.byType.some((entry) => entry.shipType === ShipType.FIGHTER)
    ).toBe(true);
  });
});
