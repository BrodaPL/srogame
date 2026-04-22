import { describe, expect, it } from 'vitest';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { Player } from '../../../src/app/models/player.js';
import { calculateFleetTravelTurns } from './command-helpers.js';

describe('command helpers', () => {
  it('uses player drive technologies when calculating fleet travel turns', () => {
    const player = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
    player.setTechLevel(TechnologyType.FUSION_DRIVE, 4);
    player.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 10);
    player.setTechLevel(TechnologyType.GRAVITON_TECHNOLOGY, 2);

    expect(calculateFleetTravelTurns(8, player, [{ type: ShipType.BATTLE_CRUISER, amount: 1 }])).toBe(3);
  });

  it('clamps travel turns to at least one turn', () => {
    const player = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
    player.setTechLevel(TechnologyType.GRAVITON_TECHNOLOGY, 10);

    expect(calculateFleetTravelTurns(1, player, [{ type: ShipType.TITAN, amount: 1 }])).toBe(1);
  });

  it('uses the worst ship modifier across the whole fleet', () => {
    const player = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
    player.setTechLevel(TechnologyType.FUSION_DRIVE, 4);
    player.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 10);
    player.setTechLevel(TechnologyType.GRAVITON_TECHNOLOGY, 2);

    expect(calculateFleetTravelTurns(8, player, [
      { type: ShipType.TITAN, amount: 1 },
      { type: ShipType.CRUISER, amount: 1 }
    ])).toBe(4);
    expect(calculateFleetTravelTurns(8, player, [
      { type: ShipType.CRUISER, amount: 1 },
      { type: ShipType.MOTHER_SHIP, amount: 1 }
    ])).toBe(6);
  });
});
