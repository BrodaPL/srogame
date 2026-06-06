import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { BotsUnitedAgainstHumansSetup } from '../../../src/app/models/diplomacy/bots-united-against-humans.ts';

export type GameCommandContext = {
  galaxy: Galaxy;
  playerId: number;
  setup?: BotsUnitedAgainstHumansSetup | null;
};
