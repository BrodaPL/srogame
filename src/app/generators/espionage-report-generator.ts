import { Player } from '../models/player';
import { Planet } from '../models/planets/planet';
import { TechnologyType } from '../models/enums/technology-type';
import { BuildingType } from '../models/enums/building-type';
import { ShipType } from '../models/enums/ship-type';
import { EspionageReportData } from '../models/reports/espionage-report-data';
import { ResourcesPack } from '../models/resources-pack';
import { DefencesQueue } from '../models/reports/defences-queue';
import { ResearchQueue } from '../models/reports/research-queue';
import { ShipyardQueue } from '../models/reports/shipyard-queue';
import { BuildingQueue } from '../models/reports/building-queue';
import { DefenceBuildingInstances } from '../models/reports/defence-building-instances';
import { ManyShips } from '../models/fleets/many-ships';
import { ManyDefences } from '../models/defences/many-defences';

export type EspionageReportOptions = {
  forcedReportLevel?: number;
  reportLevelBonus?: number;
  reportId?: number;
  createdTurn?: number;
  title?: string;
  sourceCoordinates?: { x: number; y: number; z: number } | null;
  sourcePlanetName?: string | null;
  sourceSystemName?: string | null;
  senderPlayerName?: string | null;
  isRead?: boolean;
};

export class EspionageReportGenerator {
  public createEspionageReport(
    player: Player,
    planetOwner: Player | null,
    planet: Planet,
    probeAmount: number,
    options?: EspionageReportOptions
  ): EspionageReportData {
    const reportLevel = this.resolveReportLevel(player, planetOwner, planet, probeAmount, options);
    const createdTurn = this.resolveCreatedTurn(options);
    const sourceCoordinates = options?.sourceCoordinates ?? {
      x: planet.basicInfo.solarSystem.coordinates.x,
      y: planet.basicInfo.solarSystem.coordinates.y,
      z: Math.max(0, planet.basicInfo.order - 1)
    };
    const sourcePlanetName = options?.sourcePlanetName ?? planet.basicInfo.name;
    const sourceSystemName = options?.sourceSystemName ?? planet.basicInfo.solarSystem.name;
    const title = options?.title ?? `Espionage Report: ${sourcePlanetName} (${sourceCoordinates.x}:${sourceCoordinates.y}:${sourceCoordinates.z})`;

    const includeAverageBuildings = reportLevel >= 2;
    const includeTotalResources = reportLevel >= 3;
    const includeAverageTech = reportLevel >= 4;
    const includeTotalDefences = reportLevel >= 5;
    const includeTotalShips = reportLevel >= 6;
    const includeDetailedBuildings = reportLevel >= 7;
    const includeDetailedResources = reportLevel >= 8;
    const includeDetailedTech = reportLevel >= 9;
    const includeDetailedDefences = reportLevel >= 10;
    const includeDetailedShips = reportLevel >= 11;
    const includeQueues = reportLevel >= 12;

    const buildingsAverage = includeAverageBuildings
      ? this.averageMapValue(planet.rBDSFTQ.buildingsLevels)
      : 0;
    const totalResources = includeTotalResources
      ? planet.rBDSFTQ.resources.getTotalResourceAmount()
      : 0;
    const techAverage = includeAverageTech
      ? this.averageMapValue(planetOwner?.tech ?? new Map())
      : 0;
    const totalDefences = includeTotalDefences ? this.getDefencesAmount(planet) : 0;
    const totalShips = includeTotalShips
      ? ManyShips.totalShipsCount(planet.rBDSFTQ.ships)
      : 0;

    const detailedBuildings = includeDetailedBuildings
      ? new Map(planet.rBDSFTQ.buildingsLevels)
      : new Map();
    const detailedResources = includeDetailedResources
      ? new ResourcesPack(
        planet.rBDSFTQ.resources.metal,
        planet.rBDSFTQ.resources.crystal,
        planet.rBDSFTQ.resources.deuterium
      )
      : new ResourcesPack(0, 0, 0);
    const detailedSpaceDebris = includeDetailedResources
      ? new ResourcesPack(
        planet.rBDSFTQ.spaceDebris.metal,
        planet.rBDSFTQ.spaceDebris.crystal,
        planet.rBDSFTQ.spaceDebris.deuterium
      )
      : new ResourcesPack(0, 0, 0);
    const detailedTech = includeDetailedTech
      ? new Map(planetOwner?.tech ?? new Map())
      : new Map();
    const detailedDefences = includeDetailedDefences ? this.getDefenceInstances(planet) : [];
    const detailedShips = includeDetailedShips
      ? this.toShipAmountsMap(planet.rBDSFTQ.ships)
      : new Map<ShipType, number>();

    const shipyardProduction = includeQueues ? new ShipyardQueue() : new ShipyardQueue();
    const defencesProduction = includeQueues ? new DefencesQueue() : new DefencesQueue();
    const researchProduction = includeQueues ? new ResearchQueue() : new ResearchQueue();
    const buildingProduction = includeQueues ? new BuildingQueue() : new BuildingQueue();
    const planetaryParameters = planet.getEffectivePlanetaryParameters();

    return new EspionageReportData(
      {
        reportId: options?.reportId ?? 0,
        createdTurn,
        title,
        isRead: options?.isRead ?? false,
        sourceCoordinates,
        sourcePlanetName,
        sourceSystemName,
        senderPlayerName: options?.senderPlayerName ?? planetOwner?.playerName ?? null
      },
      planet.basicInfo.colonizationDifficulty,
      planet.basicInfo.size,
      planetaryParameters,
      buildingsAverage,
      totalResources,
      techAverage,
      totalDefences,
      totalShips,
      detailedBuildings,
      detailedResources,
      detailedSpaceDebris,
      detailedTech,
      detailedDefences,
      detailedShips,
      shipyardProduction,
      defencesProduction,
      researchProduction,
      buildingProduction
    );
  }

  private toShipAmountsMap(ships: Planet['rBDSFTQ']['ships']): Map<ShipType, number> {
    return ManyShips.countByType(ships);
  }

  private resolveReportLevel(
    player: Player,
    planetOwner: Player | null,
    planet: Planet,
    probeAmount: number,
    options?: EspionageReportOptions
  ): number {
    const forcedReportLevel = options?.forcedReportLevel;
    if (Number.isFinite(forcedReportLevel)) {
      return Math.max(0, Math.floor(forcedReportLevel as number));
    }

    const bonus = Number.isFinite(options?.reportLevelBonus)
      ? Math.floor(options?.reportLevelBonus as number)
      : 0;

    return Math.max(0, this.calculateReportLevel(player, planetOwner, planet, probeAmount) + bonus);
  }

  private resolveCreatedTurn(options?: EspionageReportOptions): number {
    const createdTurn = options?.createdTurn;
    if (Number.isFinite(createdTurn)) {
      return Math.floor(createdTurn as number);
    }

    return 0;
  }

  private calculateReportLevel(
    player: Player,
    planetOwner: Player | null,
    planet: Planet,
    probeAmount: number
  ): number {
    const attackerTech = player.getTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY);
    const defenderTech = planetOwner?.getTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY) ?? 0;
    const bunkerLevel = planet.getBuildingLevel(BuildingType.BUNKER_NETWORK);
    const planetModifier = 1 + (planet.info.planetaryParameters.anomaliesAndNoise / 100);
    const normalizedProbes = Math.max(0, Math.floor(probeAmount));

    return Math.floor(attackerTech * planetModifier)
      + Math.floor(Math.sqrt(normalizedProbes))
      - Math.floor(Math.sqrt(defenderTech) * 2)
      - Math.ceil(Math.sqrt(Math.max(0, bunkerLevel)));
  }

  private averageMapValue<T>(map: Map<T, number>): number {
    if (map.size === 0) {
      return 0;
    }

    let sum = 0;
    let count = 0;

    for (const value of map.values()) {
      if (!Number.isFinite(value)) {
        continue;
      }
      sum += value;
      count += 1;
    }

    return count === 0 ? 0 : sum / count;
  }

  private getDefencesAmount(planet: Planet): number {
    return ManyDefences.totalDefencesCount(planet.rBDSFTQ.defences);
  }

  private getDefenceInstances(planet: Planet): DefenceBuildingInstances[] {
    return [...ManyDefences.countByType(planet.rBDSFTQ.defences).entries()]
      .map(([type, amount]) => new DefenceBuildingInstances(type, amount));
  }
}


