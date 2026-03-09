import type { GameType } from './enums/game-type';
import type { PlanetType } from './enums/planet-type';
import type { BuildingType } from './enums/building-type';
import type { TechnologyType } from './enums/technology-type';
import type { ShipType } from './enums/ship-type';
import type { ShipInstance } from './fleets/ship-instance';
import type { DefenceBuildingInstances } from './reports/defence-building-instances';
import type { ShipyardQueue } from './reports/shipyard-queue';
import type { DefencesQueue } from './reports/defences-queue';
import type { ResearchQueue } from './reports/research-queue';
import type { BuildingQueue } from './reports/building-queue';
import type { Fleet } from './fleets/fleet';
import type { Technology } from './tech/technology';
import type { NoteBorderColor } from './enums/note-border-color';
import type { PlayerType } from './enums/player-type';

export type GalaxySetup = {
  gameType: GameType;
  galaxyName: string;
  galaxyWidth: number;
  galaxyHeight: number;
  galaxyCenterSize: number;
  voidChance: number;
  starsAmountModifier: [number, number];
  playerAmount: number;
  botsAmount: number;
  botDifficulty: number;
  neutralBotsAmount: number;
  neutralBotsDifficulty: number;
  createRandomPlanets?: boolean;
  createStartingShips?: boolean;
  startingResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
};

export type PlayerSession = {
  id: number;
  playerName: string;
  token: string;
};

export type RegisterRequest = {
  playerName: string;
  password: string;
};

export type LoginRequest = {
  playerName: string;
  password: string;
};

export type GalaxySystemSnapshot = {
  isVoid: boolean;
  isGalaxyCenter: boolean;
  coordinates: {
    x: number;
    y: number;
  };
};

export type GalaxySnapshot = {
  name: string;
  stars: GalaxySystemSnapshot[][];
};

export type StartGameRequest = {
  setup: GalaxySetup;
};

export type StartGameResponse = {
  player: PlayerSession;
  galaxy: GalaxySnapshot;
};

export type GameStateResponse = {
  player: PlayerSession;
  galaxy: GalaxySnapshot;
};

export type ClientCoordinates = {
  x: number;
  y: number;
  z: number;
};

export type ResourcesPackDto = {
  metal: number;
  crystal: number;
  deuterium: number;
};

export type PlanetaryParametersDto = {
  metalModifier: number;
  crystalModifier: number;
  deuteriumModifier: number;
  energyModifierRES: number;
  energyModifierNuclear: number;
  scienceModifier: number;
  industryModifier: number;
  anomaliesAndNoise: number;
  hyperspaceParameters: number;
};

export type BuildingLevelEntry = {
  type: BuildingType;
  level: number;
};

export type BuildingPowerConsumptionEntry = {
  type: BuildingType;
  currentPowerConsumption: number;
};

export type BuildingQueueEntryDto = {
  buildingType: BuildingType;
  nextLevel: number;
  investedIndustryPower: number;
};

export type TechLevelEntry = {
  type: TechnologyType;
  level: number;
};

export type ShipAmountEntry = {
  type: ShipType;
  amount: number;
};

export type ShipyardQueueEntryDto = {
  shipType: ShipType;
  amount: number;
  investedShipyardPower: number;
};

export type ClientReportDataDto = {
  reportDate: number;
  planetaryParameters: PlanetaryParametersDto;
  averageBuildingLevel: number;
  averageTotalResources: number;
  averageTechLevel: number;
  totalDefencesAmount: number;
  totalShipsAmount: number;
  buildingsLevels: BuildingLevelEntry[];
  resourcesAmount: ResourcesPackDto;
  techLevels: TechLevelEntry[];
  defences: DefenceBuildingInstances[];
  ships: ShipAmountEntry[];
  shipyardProduction: ShipyardQueue;
  defencesProduction: DefencesQueue;
  researchProduction: ResearchQueue;
  buildingProduction: BuildingQueue;
};

export type ClientPlanetDto = {
  coordinates: ClientCoordinates;
  basicInfo: {
    name: string;
    type: PlanetType;
    colonizationDifficulty: number;
    order: number;
    image: string;
    size: number;
  };
  info: {
    ownerId: number | null;
    ownerPlayerType: PlayerType | null;
    ownerPlayerName: string | null;
    planetaryParameters: PlanetaryParametersDto;
  };
  objects: {
    resources: ResourcesPackDto;
    buildingsLevels: BuildingLevelEntry[];
    buildingsCurrentPowerConsumption: BuildingPowerConsumptionEntry[];
    defences: DefenceBuildingInstances[];
    ships: ShipInstance[];
    technologyQueue: Technology[];
    buildingQueue: BuildingQueueEntryDto[];
    shipyardQueue: ShipyardQueueEntryDto[];
    fleets: Fleet[];
    spaceDebris: ResourcesPackDto;
  };
  reportData: ClientReportDataDto | null;
};

export type StartBuildingConstructionRequest = {
  x: number;
  y: number;
  z: number;
  buildingType: BuildingType;
};

export type StartShipyardConstructionRequest = {
  x: number;
  y: number;
  z: number;
  shipType: ShipType;
  amount: number;
};

export type SetBuildingPowerConsumptionRequest = {
  x: number;
  y: number;
  z: number;
  buildingType: BuildingType;
  currentPowerConsumption: number;
};

export type SetBuildingPowerConsumptionResponse = {
  buildingType: BuildingType;
  currentPowerConsumption: number;
};

export type ClientInfoDto = {
  ownedPlanetCount: number;
  neutralPlanetCount: number;
  botPlanetCount: number;
  humanPlanetCount: number;
};

export type ClientStarSystemDto = {
  coordinates: ClientCoordinates;
  name: string;
  isGalaxyCenter: boolean;
  isVoid: boolean;
  isCenterEdge: boolean;
  discoveredByPlayer: number[];
  planets: ClientPlanetDto[];
  clientInfo: ClientInfoDto;
};

export type PlayerNameEntry = {
  playerId: number;
  playerName: string;
};

export type ClientGalaxyDto = {
  name: string;
  stars: ClientStarSystemDto[][];
  playerNames: PlayerNameEntry[];
};

export type GalaxyByteCellDto = {
  planetsAndAsteroids: [number, number];
};

export type OwnershipByteCellDto = {
  ownership: [number, number, number, number];
};

export type StarSystemNoteDto = {
  coordinates: {
    x: number;
    y: number;
  };
  borderColor: NoteBorderColor;
  text: string;
};

export type UpsertStarSystemNoteRequest = {
  x: number;
  y: number;
  borderColor: NoteBorderColor;
  text: string;
};

export type GalaxyPresentationDataDto = {
  galaxyBytes: GalaxyByteCellDto[][];
  ownershipBytes: Array<Array<OwnershipByteCellDto | null>>;
  ownedPlanets: ClientPlanetDto[];
  starSystemNotes: StarSystemNoteDto[];
};
