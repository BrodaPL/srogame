import { ClientPlanet } from './client-planet';
import { SolarSystem, type SolarSystemCoordinates } from './solar-system';
import type { StarSystemNote } from './star-system-note';

export class ClientInfo {
  constructor(
    public ownedPlanetCount = 0,
    public neutralPlanetCount = 0,
    public botPlanetCount = 0,
    public humanPlanetCount = 0
  ) {}
}

export class ClientStarSystem extends SolarSystem {
  public override planets: ClientPlanet[];
  public clientInfo: ClientInfo;

  constructor(
    name: string,
    isGalaxyCenter: boolean,
    isVoid: boolean,
    coordinates: SolarSystemCoordinates,
    discoveredByPlayer: Set<number>,
    starSystemNotes: Map<number, StarSystemNote>,
    planets: ClientPlanet[],
    clientInfo: ClientInfo
  ) {
    super(name, -10, isGalaxyCenter, isVoid, coordinates, discoveredByPlayer, starSystemNotes);
    this.planets = planets;
    this.clientInfo = clientInfo;
  }
}
