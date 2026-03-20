export type EncounterLocation =
  | {
    kind: 'planetOrbit';
    x: number;
    y: number;
    z: number;
  }
  | {
    kind: 'starSystem';
    x: number;
    y: number;
  };
