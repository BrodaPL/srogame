import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { Galaxy } from '../galaxy';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
import { SolarSystem } from '../solar-system';

describe('Galaxy', () => {
  it('reveals a foreign owner id when the viewer has report data for that planet', () => {
    const system = new SolarSystem('Intel Test', 2, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
    const originPlanet = system.planets[0]!;
    const targetPlanet = system.planets[1]!;
    originPlanet.info.ownerId = 1;
    targetPlanet.info.ownerId = 2;
    targetPlanet.lastReportData.set(1, {} as never);

    const alpha = new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER);
    const beta = new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER);
    const galaxy = new Galaxy('Intel Galaxy', [alpha, beta], [[system]]);

    const clientPlanet = galaxy.createClientPlanet(targetPlanet, 1);

    expect(clientPlanet.info.ownerId).toBe(2);
    expect(clientPlanet.ownerPlayerName).toBe('Beta');
  });

  it('reveals a foreign owner id for allied planets even without report data', () => {
    const system = new SolarSystem('Friendly Test', 2, false, false, { x: 2, y: 2 }, new Set<number>(), new Map());
    const originPlanet = system.planets[0]!;
    const targetPlanet = system.planets[1]!;
    originPlanet.info.ownerId = 1;
    targetPlanet.info.ownerId = 2;

    const alpha = new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER);
    const beta = new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER);
    const galaxy = new Galaxy('Friendly Galaxy', [alpha, beta], [[system]]);
    galaxy.diplomaticRelations = [{
      playerAId: 1,
      playerBId: 2,
      status: DiplomaticStatus.ALLIED
    }];

    const clientPlanet = galaxy.createClientPlanet(targetPlanet, 1);

    expect(clientPlanet.info.ownerId).toBe(2);
    expect(clientPlanet.ownerPlayerName).toBe('Beta');
  });
});
