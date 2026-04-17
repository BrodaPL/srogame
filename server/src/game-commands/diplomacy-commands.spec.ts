import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { Player } from '../../../src/app/models/player.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import {
  approveDiplomaticProposalCommand,
  createDiplomaticProposalCommand
} from './diplomacy-commands.js';

function createDiplomacyTestGalaxy() {
  const system = new SolarSystem('Diplomacy Test', 2, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
  system.planets[0].info.ownerId = 1;
  system.planets[1].info.ownerId = 2;

  const alpha = new Player(1, 'Alpha', [system.planets[0]], new Map(), [], PlayerType.PLAYER);
  const beta = new Player(2, 'Beta', [system.planets[1]], new Map(), [], PlayerType.PLAYER);
  return new Galaxy('Diplomacy Galaxy', [alpha, beta], [[system]], 12, [], 1);
}

describe('diplomacy commands', () => {
  it('allows NEUTRAL to PEACE proposals', () => {
    const galaxy = createDiplomacyTestGalaxy();

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.PEACE }
    );

    expect(result.ok).toBe(true);
    expect(galaxy.diplomaticProposals).toHaveLength(1);
    expect(galaxy.diplomaticProposals[0].requestedStatus).toBe(DiplomaticStatus.PEACE);
  });

  it('allows NEUTRAL to WAR proposals', () => {
    const galaxy = createDiplomacyTestGalaxy();

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.WAR }
    );

    expect(result.ok).toBe(true);
    expect(galaxy.diplomaticProposals).toHaveLength(1);
    expect(galaxy.diplomaticProposals[0].requestedStatus).toBe(DiplomaticStatus.WAR);
  });

  it('allows proposals without prior espionage visibility', () => {
    const galaxy = createDiplomacyTestGalaxy();

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.PEACE }
    );

    expect(result.ok).toBe(true);
    expect(galaxy.diplomaticProposals).toHaveLength(1);
  });

  it('creates human proposals with the normal one-turn expiry window', () => {
    const galaxy = createDiplomacyTestGalaxy();

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.PEACE }
    );

    expect(result.ok).toBe(true);
    expect(galaxy.diplomaticProposals[0]?.createdTurn).toBe(galaxy.currentTurn);
    expect(galaxy.diplomaticProposals[0]?.expiresOnTurn).toBe(galaxy.currentTurn + 1);
  });

  it('rejects direct NEUTRAL to ALLIED proposals', () => {
    const galaxy = createDiplomacyTestGalaxy();

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.ALLIED }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(409);
    }
    expect(galaxy.diplomaticProposals).toHaveLength(0);
  });

  it('allows PEACE to ALLIED after peace is accepted', () => {
    const galaxy = createDiplomacyTestGalaxy();

    const peaceProposalResult = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.PEACE }
    );
    expect(peaceProposalResult.ok).toBe(true);

    const acceptedPeaceResult = approveDiplomaticProposalCommand(
      { galaxy, playerId: 2 },
      { proposalId: galaxy.diplomaticProposals[0].proposalId }
    );
    expect(acceptedPeaceResult.ok).toBe(true);
    galaxy.currentTurn += 1;

    const allianceProposalResult = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.ALLIED }
    );

    expect(allianceProposalResult.ok).toBe(true);
    expect(galaxy.diplomaticProposals.at(-1)?.requestedStatus).toBe(DiplomaticStatus.ALLIED);
  });

  it('allows WAR to NEUTRAL proposals', () => {
    const galaxy = createDiplomacyTestGalaxy();
    galaxy.diplomaticRelations = [{
      playerAId: 1,
      playerBId: 2,
      status: DiplomaticStatus.WAR
    }];

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.NEUTRAL }
    );

    expect(result.ok).toBe(true);
    expect(galaxy.diplomaticProposals.at(-1)?.requestedStatus).toBe(DiplomaticStatus.NEUTRAL);
  });

  it('allows PEACE to NEUTRAL proposals', () => {
    const galaxy = createDiplomacyTestGalaxy();
    galaxy.diplomaticRelations = [{
      playerAId: 1,
      playerBId: 2,
      status: DiplomaticStatus.PEACE
    }];

    const result = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.NEUTRAL }
    );

    expect(result.ok).toBe(true);
    expect(galaxy.diplomaticProposals.at(-1)?.requestedStatus).toBe(DiplomaticStatus.NEUTRAL);
  });

  it('allows ALLIED to PEACE but still rejects direct ALLIED to NEUTRAL proposals', () => {
    const galaxy = createDiplomacyTestGalaxy();
    galaxy.diplomaticRelations = [{
      playerAId: 1,
      playerBId: 2,
      status: DiplomaticStatus.ALLIED
    }];

    const peaceResult = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.PEACE }
    );

    expect(peaceResult.ok).toBe(true);
    galaxy.diplomaticProposals = [];

    const neutralResult = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.NEUTRAL }
    );

    expect(neutralResult.ok).toBe(false);
    if (!neutralResult.ok) {
      expect(neutralResult.error.status).toBe(409);
    }
  });

  it('allows proposals to bot empires but still rejects neutral empires', () => {
    const system = new SolarSystem('Diplomacy Test', 3, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
    system.planets[0].info.ownerId = 1;
    system.planets[1].info.ownerId = 2;
    system.planets[2].info.ownerId = 3;

    const alpha = new Player(1, 'Alpha', [system.planets[0]], new Map(), [], PlayerType.PLAYER);
    const bot = new Player(2, 'Bot', [system.planets[1]], new Map(), [], PlayerType.BOT);
    const neutral = new Player(3, 'Neutral', [system.planets[2]], new Map(), [], PlayerType.NEUTRAL);
    const galaxy = new Galaxy('Diplomacy Galaxy', [alpha, bot, neutral], [[system]], 12, [], 1);

    const botResult = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 2, requestedStatus: DiplomaticStatus.PEACE }
    );
    expect(botResult.ok).toBe(true);

    const neutralResult = createDiplomaticProposalCommand(
      { galaxy, playerId: 1 },
      { targetPlayerId: 3, requestedStatus: DiplomaticStatus.PEACE }
    );
    expect(neutralResult.ok).toBe(false);
    if (!neutralResult.ok) {
      expect(neutralResult.error.status).toBe(403);
    }
  });
});
