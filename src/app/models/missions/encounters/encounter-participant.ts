export type EncounterParticipant =
  | {
    kind: 'fleet';
    fleetId: number;
    ownerId: number;
  }
  | {
    kind: 'orbitingShips';
    planetId: string;
    ownerId: number;
  }
  | {
    kind: 'planetDefenses';
    planetId: string;
    ownerId: number;
  };
