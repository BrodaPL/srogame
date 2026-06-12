import { ReportType } from '../enums/report-type';
import { ManyShips, type ManyShipsLike } from '../fleets/many-ships';
import { encodeRuntimeText } from '../../i18n/runtime-text.utils';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export type FleetReportCargoLike = {
  metal: number;
  crystal: number;
  deuterium: number;
};

export function formatFleetReportShips(ships: ManyShipsLike | null | undefined): string {
  const entries = [...ManyShips.countByType(ships).entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, amount]) => `${type} x${amount}`);

  return entries.length > 0 ? entries.join(', ') : encodeRuntimeText('generated.shared.none');
}

export function formatFleetReportCargo(cargo: FleetReportCargoLike | null | undefined): string {
  return encodeRuntimeText('generated.fleet.manifest.cargo', {
    metal: formatResourceAmount(cargo?.metal),
    crystal: formatResourceAmount(cargo?.crystal),
    deuterium: formatResourceAmount(cargo?.deuterium),
  });
}

export function appendFleetReportManifest(
  body: string,
  ships: ManyShipsLike | null | undefined,
  cargo: FleetReportCargoLike | null | undefined,
): string {
  const shipsLine = encodeRuntimeText('generated.fleet.manifest.ships', {
    ships: formatFleetReportShips(ships),
  });
  const cargoLine = formatFleetReportCargo(cargo);
  const trimmedBody = body.trim();
  const manifest = `${shipsLine}\n${cargoLine}`;
  return trimmedBody.length > 0 ? `${trimmedBody}\n${manifest}` : manifest;
}

function formatResourceAmount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

export class FleetReport extends TextPlayerReport {
  constructor(data: PlayerReportBaseData, body: string) {
    super(ReportType.FLEET_REPORT, data, body);
  }

  public override copy(): FleetReport {
    return new FleetReport(this.copyBaseData(), this.body);
  }
}
