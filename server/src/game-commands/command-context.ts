import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';

export type GameCommandContext = {
  galaxy: Galaxy;
  playerId: number;
};
