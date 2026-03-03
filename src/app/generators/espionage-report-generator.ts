import { Player } from '../models/player';
import { Planet } from '../models/planets/planet';
import { TechnologyType } from '../models/enums/technology-type';
import { BuildingType } from '../models/enums/building-type';
import { EspionageReportData } from '../models/reports/espionage-report-data';
import { ResourcesPack } from '../models/resources-pack';
import { DefencesQueue } from '../models/reports/defences-queue';
import { ResearchQueue } from '../models/reports/research-queue';
import { ShipyardQueue } from '../models/reports/shipyard-queue';
import { BuildingQueue } from '../models/reports/building-queue';
import { DefenceBuildingInstances } from '../models/reports/defence-building-instances';

export class EspionageReportGenerator {
  public createEspionageReport(
    player: Player,
    planetOwner: Player | null,
    planet: Planet,
    probeAmount: number
  ): EspionageReportData {
    const reportLevel = this.calculateReportLevel(player, planetOwner, planet, probeAmount);

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
      ? this.averageMapValue(planet.buildingsLevels)
      : 0;
    const totalResources = includeTotalResources
      ? planet.resources.getTotalResourceAmount()
      : 0;
    const techAverage = includeAverageTech
      ? this.averageMapValue(planetOwner?.tech ?? new Map())
      : 0;
    const totalDefences = includeTotalDefences ? this.getDefencesAmount() : 0;
    const totalShips = includeTotalShips
      ? planet.orbitShips.length
      : 0;

    const detailedBuildings = includeDetailedBuildings
      ? new Map(planet.buildingsLevels)
      : new Map();
    const detailedResources = includeDetailedResources
      ? new ResourcesPack(
        planet.resources.metal,
        planet.resources.crystal,
        planet.resources.deuterium
      )
      : new ResourcesPack(0, 0, 0);
    const detailedTech = includeDetailedTech
      ? new Map(planetOwner?.tech ?? new Map())
      : new Map();
    const detailedDefences = includeDetailedDefences ? this.getDefenceInstances() : [];
    const detailedShips = includeDetailedShips
      ? [...planet.orbitShips]
      : [];

    const shipyardProduction = includeQueues ? new ShipyardQueue() : new ShipyardQueue();
    const defencesProduction = includeQueues ? new DefencesQueue() : new DefencesQueue();
    const researchProduction = includeQueues ? new ResearchQueue() : new ResearchQueue();
    const buildingProduction = includeQueues ? new BuildingQueue() : new BuildingQueue();

    return new EspionageReportData(
      Date.now(), //TODO replace with current turn number
      planet.planetaryParameters,
      buildingsAverage,
      totalResources,
      techAverage,
      totalDefences,
      totalShips,
      detailedBuildings,
      detailedResources,
      detailedTech,
      detailedDefences,
      detailedShips,
      shipyardProduction,
      defencesProduction,
      researchProduction,
      buildingProduction
    );
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
    const planetModifier = 1 + (planet.planetaryParameters.anomaliesAndNoise / 100);
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

  private getDefencesAmount(): number {
    // Defence instances are not modeled yet.
    return 0;
  }

  private getDefenceInstances(): DefenceBuildingInstances[] {
    // Defence instances are not modeled yet.
    return [];
  }
}
