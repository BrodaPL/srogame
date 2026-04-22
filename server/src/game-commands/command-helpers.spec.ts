import { describe, expect, it } from 'vitest';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { Player } from '../../../src/app/models/player.js';
import { calculateFleetTravelTurns } from './command-helpers.js';

describe('command helpers', () => {
  it('uses player drive technologies when calculating fleet travel turns', () => {
    const player = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
    player.setTechLevel(TechnologyType.FUSION_DRIVE, 4);
    player.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 10);
    player.setTechLevel(TechnologyType.GRAVITON_TECHNOLOGY, 2);

    expect(calculateFleetTravelTurns(8, player)).toBe(3);
  });

  it('clamps travel turns to at least one turn', () => {
    const player = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
    player.setTechLevel(TechnologyType.GRAVITON_TECHNOLOGY, 10);

    expect(calculateFleetTravelTurns(1, player)).toBe(1);
  });
});
