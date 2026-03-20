export type FleetEncounterResolution = 'notInvolved' | 'victory' | 'defeat' | 'retreat' | 'stalemate';

export type FleetEncounterOutcome = {
  fleetId: number;
  resolution: FleetEncounterResolution;
};
