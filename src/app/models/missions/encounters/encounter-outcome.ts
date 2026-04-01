import type { SpaceBattleReports } from '../../battles/space-battle-resolver';

export type FleetEncounterResolution = 'notInvolved' | 'victory' | 'defeat' | 'retreat' | 'stalemate';

export type FleetEncounterOutcome = {
  fleetId: number;
  resolution: FleetEncounterResolution;
  battleReports?: SpaceBattleReports | null;
};
