import { SolarSystem } from './solar-system';
import { Player } from '../player';
import { NAMES_LIST } from '../enums/names-list';
import { PlayerType } from '../enums/player-type';
import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ as RBDSFTQ } from './planet';
import { PlanetaryParameters } from './planetary-parameters';
import { ResourcesPack } from '../resources-pack';
import { ClientGalaxy } from './client-galaxy';
import { ClientPlanet } from './client-planet';
import { ClientInfo, ClientStarSystem } from './client-star-system';
import { Fleet } from '../fleets/fleet';
import { ManyShips } from '../fleets/many-ships';
import { ManyDefences } from '../defences/many-defences';
import type { DiplomaticRelation } from '../diplomacy/diplomatic-relation';
import type { DiplomaticProposal } from '../diplomacy/diplomatic-proposal';
import type { MaintenanceRequest } from '../requests/maintenance-request';

export class Galaxy {
  public static buildSolarSystemNamePool(shuffle = true): string[] {
    const names: string[] = [];

    const MAX_NAME_LENGTH = 15;
    for (const prefix of NAMES_LIST) {
        names.push(`${prefix}`);
      for (const suffix of NAMES_LIST) {
        const combinedName = `${prefix} ${suffix}`;
        if (combinedName.length <= MAX_NAME_LENGTH) {
          names.push(combinedName);
        }
      }
    }

    if (shuffle) {
      Galaxy.shuffleInPlace(names);
    }

    return names;
  }

  constructor(
    public name: string,
    public players: Player[],
    public stars: SolarSystem[][],
    public currentTurn = 1,
    public activeFleets: Fleet[] = [],
    public nextFleetId = 1,
    public humanPlayerMap: Map<number, Player> = new Map(),
    public botPlayerMap: Map<number, Player> = new Map(),
    public neutralPlayerMap: Map<number, Player> = new Map(),
    public playerNameMap: Map<string, number> = new Map(),
    public diplomaticRelations: DiplomaticRelation[] = [],
    public diplomaticProposals: DiplomaticProposal[] = [],
    public nextDiplomaticProposalId = 1,
    public maintenanceRequests: MaintenanceRequest[] = [],
    public nextMaintenanceRequestId = 1
  ) {}

  public createClientPlanet(
    planet: Planet,
    playerId: number,
    playerTypeById: Map<number, PlayerType> = this.buildPlayerTypeMap(),
    playerNameById: Map<number, string> = this.buildPlayerNameById()
  ): ClientPlanet {
    const reportData = planet.lastReportData.get(playerId) ?? null;
    const basicInfo = new PlanetBasicInfo(
      planet.basicInfo.name,
      planet.basicInfo.type,
      planet.basicInfo.colonizationDifficulty,
      planet.basicInfo.order,
      planet.basicInfo.solarSystem,
      planet.basicInfo.image,
      planet.basicInfo.size
    );

    const isOwnedByPlayer = planet.info.ownerId === playerId;
    const info = isOwnedByPlayer
      ? planet.info
      : new PlanetInfo(null, new PlanetaryParameters(0, 0, 0, 0, 0, 0, 0, 0, 0));
    const rBDSFTQ = isOwnedByPlayer
      ? planet.rBDSFTQ
      : new RBDSFTQ(
        new ResourcesPack(0, 0, 0),
        new Map(),
        new Map(),
        new Map(),
        ManyDefences.empty(),
        ManyShips.empty(),
        null,
        null,
        [],
        [],
        [],
        new ResourcesPack(0, 0, 0)
      );
    const ownerPlayerType = isOwnedByPlayer
      ? PlayerType.PLAYER
      : reportData && planet.info.ownerId !== null
        ? playerTypeById.get(planet.info.ownerId) ?? null
        : null;
    const ownerPlayerName = isOwnedByPlayer
      ? playerNameById.get(playerId) ?? null
      : reportData && planet.info.ownerId !== null
        ? playerNameById.get(planet.info.ownerId) ?? null
        : null;

    return new ClientPlanet(
      basicInfo,
      info,
      rBDSFTQ,
      ownerPlayerType,
      ownerPlayerName,
      reportData,
      new Map()
    );
  }

  public createClientStarSystem(
    system: SolarSystem,
    playerId: number,
    includePlanets = true
  ): ClientStarSystem {
    const playerTypeById = this.buildPlayerTypeMap();
    const playerNameById = this.buildPlayerNameById();
    return this.createClientStarSystemInternal(
      system,
      playerId,
      playerTypeById,
      playerNameById,
      includePlanets
    );
  }

  public createClientGalaxy(playerId: number, includePlanets = true): ClientGalaxy {
    const playerTypeById = this.buildPlayerTypeMap();
    const playerNameById = this.buildPlayerNameById();

    const clientStars = this.stars.map((row) =>
      row.map((system) =>
        this.createClientStarSystemInternal(
          system,
          playerId,
          playerTypeById,
          playerNameById,
          includePlanets
        )
      )
    );

    return new ClientGalaxy(this.name, clientStars, playerNameById);
  }

  private createClientStarSystemInternal(
    system: SolarSystem,
    playerId: number,
    playerTypeById: Map<number, PlayerType>,
    playerNameById: Map<number, string>,
    includePlanets: boolean
  ): ClientStarSystem {
    const clientInfo = new ClientInfo();
    const clientPlanets = includePlanets
      ? system.planets.map((planet) =>
        this.createClientPlanet(planet, playerId, playerTypeById, playerNameById)
      )
      : [];

    for (const planet of system.planets) {
      if (planet.info.ownerId === playerId) {
        clientInfo.ownedPlanetCount += 1;
        continue;
      }

      const reportData = planet.lastReportData.get(playerId) ?? null;
      if (!reportData) {
        continue;
      }

      const ownerId = planet.info.ownerId;
      if (ownerId === null) {
        clientInfo.neutralPlanetCount += 1;
        continue;
      }

      const ownerType = playerTypeById.get(ownerId);
      if (ownerType === PlayerType.BOT) {
        clientInfo.botPlanetCount += 1;
      } else if (ownerType === PlayerType.NEUTRAL) {
        clientInfo.neutralPlanetCount += 1;
      } else if (ownerType === PlayerType.PLAYER) {
        clientInfo.humanPlanetCount += 1;
      }
    }

    return new ClientStarSystem(
      system.name,
      system.isGalaxyCenter,
      system.isVoid,
      system.coordinates,
      new Set(system.discoveredByPlayer),
      new Map(system.starSystemNotes),
      clientPlanets,
      clientInfo
    );
  }

  private buildPlayerTypeMap(): Map<number, PlayerType> {
    const map = new Map<number, PlayerType>();
    for (const player of this.players) {
      map.set(player.playerId, player.type);
    }
    return map;
  }

  private buildPlayerNameById(): Map<number, string> {
    const map = new Map<number, string>();
    for (const player of this.players) {
      map.set(player.playerId, player.playerName);
    }
    return map;
  }

  private static shuffleInPlace(values: string[]): void {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
  }
}



