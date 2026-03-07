import { ClientPlanet } from './client-planet';
import type { Galaxy } from './galaxy';
import { GalaxyByteCell } from './galaxy-byte-cell';
import { OwnershipByteCell } from './ownership-byte-cell';
import { PlayerType } from '../enums/player-type';

export class GalaxyPresentationData {
  constructor(
    public galaxyBytes: GalaxyByteCell[][],
    public ownershipBytes: Array<Array<OwnershipByteCell | null>>,
    public ownedPlanets: ClientPlanet[]
  ) {}

  public static fromGalaxy(galaxy: Galaxy, playerId: number): GalaxyPresentationData {
    const galaxyBytes: GalaxyByteCell[][] = [];
    const ownershipBytes: Array<Array<OwnershipByteCell | null>> = [];
    const ownedPlanets: ClientPlanet[] = [];
    const playerTypeById = new Map<number, PlayerType>();

    for (const player of galaxy.players) {
      playerTypeById.set(player.playerId, player.type);
    }

    for (const row of galaxy.stars) {
      const byteRow: GalaxyByteCell[] = [];
      const ownershipRow: Array<OwnershipByteCell | null> = [];
      for (const system of row) {
        byteRow.push(GalaxyByteCell.fromSolarSystem(system));
        ownershipRow.push(OwnershipByteCell.fromSolarSystem(system, playerId, playerTypeById));
        for (let index = 0; index < system.planets.length; index += 1) {
          const planet = system.planets[index];
          if (planet.info.ownerId === playerId) {
            ownedPlanets.push(galaxy.createClientPlanet(planet, playerId));
          }
        }
      }
      galaxyBytes.push(byteRow);
      ownershipBytes.push(ownershipRow);
    }

    return new GalaxyPresentationData(galaxyBytes, ownershipBytes, ownedPlanets);
  }
}
