import type {
  EspionagePlayerReportDto,
  PlayerReportDto,
  TextPlayerReportDto
} from '../game-api-types';
import { ReportType } from '../enums/report-type';
import { BuildingQueue } from './building-queue';
import { BuildingsReport } from './buildings-report';
import { ColonizationReport } from './colonization-report';
import { DefenseReport } from './defense-report';
import { DefencesQueue } from './defences-queue';
import { EspionageReportData } from './espionage-report-data';
import { FleetReport } from './fleet-report';
import { PlanetaryParameters } from '../planets/planetary-parameters';
import { PlayerReport } from './player-report';
import { ProductionReport } from './production-report';
import { ResearchQueue } from './research-queue';
import { ResearchReport } from './research-report';
import { ResourcesPack } from '../resources-pack';
import { SensorPhalanxReport } from './sensor-phalanx-report';
import { ShipyardQueue } from './shipyard-queue';
import { StarSystemEspionageReport } from './star-system-espionage-report';
import { DefenceBuildingInstances } from './defence-building-instances';

function toBaseData(report: PlayerReportDto) {
  return {
    reportId: report.reportId,
    createdTurn: report.createdTurn,
    title: report.title,
    isRead: report.isRead,
    sourceCoordinates: report.sourceCoordinates,
    sourcePlanetName: report.sourcePlanetName,
    sourceSystemName: report.sourceSystemName,
    senderPlayerName: report.senderPlayerName
  };
}

function fromTextReportDto(report: TextPlayerReportDto): PlayerReport {
  const baseData = toBaseData(report);

  switch (report.reportType) {
    case ReportType.DEFENSE_REPORT:
      return new DefenseReport(baseData, report.body);
    case ReportType.RESEARCH_REPORT:
      return new ResearchReport(baseData, report.body);
    case ReportType.PRODUCTION_REPORT:
      return new ProductionReport(baseData, report.body);
    case ReportType.BUILDINGS_REPORT:
      return new BuildingsReport(baseData, report.body);
    case ReportType.FLEET_REPORT:
      return new FleetReport(baseData, report.body);
    case ReportType.STAR_SYSTEM_ESPIONAGE_REPORT:
      return new StarSystemEspionageReport(baseData, report.body);
    case ReportType.SENSOR_PHALANX_REPORT:
      return new SensorPhalanxReport(baseData, report.body);
    case ReportType.COLONIZATION_REPORT:
      return new ColonizationReport(baseData, report.body);
    default:
      return new ProductionReport(baseData, report.body);
  }
}

function fromEspionageReportDto(report: EspionagePlayerReportDto): EspionageReportData {
  return new EspionageReportData(
    toBaseData(report),
    report.diff,
    report.size,
    new PlanetaryParameters(
      report.planetaryParameters.metalModifier,
      report.planetaryParameters.crystalModifier,
      report.planetaryParameters.deuteriumModifier,
      report.planetaryParameters.energyModifierRES,
      report.planetaryParameters.energyModifierNuclear,
      report.planetaryParameters.scienceModifier,
      report.planetaryParameters.industryModifier,
      report.planetaryParameters.anomaliesAndNoise,
      report.planetaryParameters.hyperspaceParameters
    ),
    report.averageBuildingLevel,
    report.averageTotalResources,
    report.averageTechLevel,
    report.totalDefencesAmount,
    report.totalShipsAmount,
    new Map(report.buildingsLevels.map((entry) => [entry.type, entry.level])),
    new ResourcesPack(
      report.resourcesAmount.metal,
      report.resourcesAmount.crystal,
      report.resourcesAmount.deuterium
    ),
    new Map(report.techLevels.map((entry) => [entry.type, entry.level])),
    report.defences.map((entry) => new DefenceBuildingInstances(entry.type, entry.amount)),
    new Map(report.ships.map((entry) => [entry.type, entry.amount])),
    Object.assign(new ShipyardQueue(), report.shipyardProduction),
    Object.assign(new DefencesQueue(), report.defencesProduction),
    Object.assign(new ResearchQueue(), report.researchProduction),
    Object.assign(new BuildingQueue(), report.buildingProduction)
  );
}

export function fromPlayerReportDto(report: PlayerReportDto): PlayerReport {
  switch (report.reportType) {
    case ReportType.ESPIONAGE_REPORT:
      return fromEspionageReportDto(report as EspionagePlayerReportDto);
    default:
      return fromTextReportDto(report as TextPlayerReportDto);
  }
}
