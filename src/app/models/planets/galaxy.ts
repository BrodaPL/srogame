import { SolarSystem } from './solar-system';
import { Player } from '../player';
import { PlayerID } from '../player-id';
import { NAMES_LIST } from '../enums/names-list';

export class Galaxy {
  public static buildSolarSystemNamePool(shuffle = true): string[] {
    const names: string[] = [];

    const MAX_NAME_LENGTH = 15;
    for (const prefix of NAMES_LIST) {
        names.push(`${prefix}`);
      for (const suffix of NAMES_LIST) {
        const combinedName = `${prefix} ${suffix}`;
        if (combinedName.length <= MAX_NAME_LENGTH) {
          names.push(combinedName);
        }
      }
    }

    if (shuffle) {
      Galaxy.shuffleInPlace(names);
    }

    return names;
  }

  constructor(
    public name: string,
    public players: Player[],
    public stars: SolarSystem[][],
    public humanPlayerMap: Map<PlayerID, Player> = new Map(),
    public botPlayerMap: Map<PlayerID, Player> = new Map(),
    public neutralPlayerMap: Map<PlayerID, Player> = new Map(),
    public playerNameMap: Map<string, PlayerID> = new Map()
  ) {}

  private static shuffleInPlace(values: string[]): void {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
  }
}
