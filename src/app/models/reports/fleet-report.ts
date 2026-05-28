import { ReportType } from '../enums/report-type';
import { ManyShips, type ManyShipsLike } from '../fleets/many-ships';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export function formatFleetReportShips(ships: ManyShipsLike | null | undefined): string {
  const entries = [...ManyShips.countByType(ships).entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, amount]) => `${type} x${amount}`);

  return entries.length > 0 ? entries.join(', ') : 'none';
}

export function appendFleetReportShips(body: string, ships: ManyShipsLike | null | undefined): string {
  const shipsLine = `Fleet ships: ${formatFleetReportShips(ships)}`;
  const trimmedBody = body.trim();
  return trimmedBody.length > 0 ? `${trimmedBody}\n${shipsLine}` : shipsLine;
}

export class FleetReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.FLEET_REPORT, data, body);
  }

  public override copy(): FleetReport {
    return new FleetReport(
      this.copyBaseData(),
      this.body
    );
  }
}
