import type { EspionageReportData } from '../reports/espionage-report-data';
import { ClientPlanet } from './client-planet';
import type { Galaxy } from './galaxy';
import { GalaxyByteCell } from './galaxy-byte-cell';

export type PlanetCoordinates = {
  x: number;
  y: number;
  z: number;
};

export class GalaxyPresentationData {
  constructor(
    public reportMap: Map<PlanetCoordinates, EspionageReportData>,
    public galaxyBytes: GalaxyByteCell[][],
    public ownedPlanets: ClientPlanet[]
  ) {}

  public static fromGalaxy(galaxy: Galaxy, playerId: number): GalaxyPresentationData {
    const reportMap = new Map<PlanetCoordinates, EspionageReportData>();
    const galaxyBytes: GalaxyByteCell[][] = [];
    const ownedPlanets: ClientPlanet[] = [];

    for (const row of galaxy.stars) {
      const byteRow: GalaxyByteCell[] = [];
      for (const system of row) {
        byteRow.push(GalaxyByteCell.fromSolarSystem(system));

        for (let index = 0; index < system.planets.length; index += 1) {
          const planet = system.planets[index];
          const reportData = planet.lastReportData.get(playerId);
          if (reportData) {
            reportMap.set(
              {
                x: system.coordinates.x,
                y: system.coordinates.y,
                z: index
              },
              reportData
            );
          }

          if (planet.info.ownerId === playerId) {
            ownedPlanets.push(galaxy.createClientPlanet(planet, playerId));
          }
        }
      }
      galaxyBytes.push(byteRow);
    }

    return new GalaxyPresentationData(reportMap, galaxyBytes, ownedPlanets);
  }
}
