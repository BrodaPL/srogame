import { describe, expect, it } from 'vitest';
import { BuildingQueueEntry } from '../../buildings/building-queue-entry';
import { ManyDefences } from '../../defences/many-defences';
import { BuildingType } from '../../enums/building-type';
import { DefenceType } from '../../enums/defence-type';
import { PlayerType } from '../../enums/player-type';
import { ShipType } from '../../enums/ship-type';
import { TechnologyType } from '../../enums/technology-type';
import { ManyShips } from '../../fleets/many-ships';
import { ShipyardQueueEntry } from '../../fleets/shipyard-queue-entry';
import { Galaxy } from '../galaxy';
import { abandonPlanetToNewNeutralOwner } from '../planet-abandonment';
import { SolarSystem } from '../solar-system';
import { Player } from '../../player';
import { ResourcesPack } from '../../resources-pack';
import { ResearchHelperFor } from '../../tech/research-helper-for';
import { TechnologyQueueEntry } from '../../tech/technology-queue-entry';

function point(x: number, y: number, z: number) {
  return { x, y, z };
}

describe('abandonPlanetToNewNeutralOwner', () => {
  it('transfers the planet to a fresh neutral owner and clears queues plus research links', () => {
    const system = new SolarSystem('Abandon Test', 3, false, false, { x: 2, y: 2 }, new Set<number>(), new Map());
    const abandonedPlanet = system.planets[0];
    const helperPlanet = system.planets[1];
    const mainResearchPlanet = system.planets[2];

    abandonedPlanet.info.ownerId = 1;
    helperPlanet.info.ownerId = 1;
    mainResearchPlanet.info.ownerId = 1;

    abandonedPlanet.rBDSFTQ.resources = new ResourcesPack(500, 250, 125);
    abandonedPlanet.rBDSFTQ.ships = ManyShips.empty();
    abandonedPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    abandonedPlanet.rBDSFTQ.defences = ManyDefences.empty();
    abandonedPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.LIGHT_BEAM_CANNON, 3);
    abandonedPlanet.rBDSFTQ.buildingQueue = [
      new BuildingQueueEntry(BuildingType.METAL_MINE, 3, 12)
    ];
    abandonedPlanet.rBDSFTQ.shipyardQueue = [
      ShipyardQueueEntry.ship(ShipType.FIGHTER, 4, 9)
    ];
    abandonedPlanet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
      TechnologyType.ENERGY_TECHNOLOGY,
      2,
      20,
      [point(2, 2, 1)]
    );
    abandonedPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(point(2, 2, 2), TechnologyType.COMPUTER_TECHNOLOGY);

    helperPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(point(2, 2, 0), TechnologyType.ENERGY_TECHNOLOGY);
    mainResearchPlanet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
      TechnologyType.COMPUTER_TECHNOLOGY,
      1,
      15,
      [point(2, 2, 0)]
    );

    const owner = new Player(1, 'Alpha', [abandonedPlanet, helperPlanet, mainResearchPlanet], new Map(), [], PlayerType.PLAYER);
    const galaxy = new Galaxy('Abandon Galaxy', [owner], [[system]], 7);
    galaxy.humanPlayerMap.set(owner.playerId, owner);
    galaxy.playerNameMap.set(owner.playerName, owner.playerId);

    const neutralOwner = abandonPlanetToNewNeutralOwner(galaxy, owner, abandonedPlanet);

    expect(owner.planets).toEqual([helperPlanet, mainResearchPlanet]);
    expect(neutralOwner.type).toBe(PlayerType.NEUTRAL);
    expect(neutralOwner.planets).toEqual([abandonedPlanet]);
    expect(abandonedPlanet.info.ownerId).toBe(neutralOwner.playerId);
    expect(galaxy.neutralPlayerMap.get(neutralOwner.playerId)).toBe(neutralOwner);
    expect(abandonedPlanet.rBDSFTQ.buildingQueue).toHaveLength(0);
    expect(abandonedPlanet.rBDSFTQ.shipyardQueue).toHaveLength(0);
    expect(abandonedPlanet.rBDSFTQ.currentResearchQueue).toBeNull();
    expect(abandonedPlanet.rBDSFTQ.researchHelperFor).toBeNull();
    expect(helperPlanet.rBDSFTQ.researchHelperFor).toBeNull();
    expect(mainResearchPlanet.rBDSFTQ.currentResearchQueue?.helperLabs).toEqual([]);
    expect(abandonedPlanet.rBDSFTQ.resources.metal).toBe(500);
    expect(ManyShips.undamagedCountByType(abandonedPlanet.rBDSFTQ.ships).get(ShipType.CRUISER) ?? 0).toBe(2);
    expect(ManyDefences.undamagedCountByType(abandonedPlanet.rBDSFTQ.defences).get(DefenceType.LIGHT_BEAM_CANNON) ?? 0).toBe(3);
  });
});
