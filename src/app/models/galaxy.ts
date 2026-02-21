import { SolarSystem } from './solar-system';
import { Player } from './player';
import { NAMES_LIST } from './enum/names-list';

export class Galaxy {
  public static buildSolarSystemNamePool(shuffle = true): string[] {
    const names: string[] = [];

    for (const prefix of NAMES_LIST) {
      names.push(`${prefix}`);
      for (const suffix of NAMES_LIST) {
        names.push(`${prefix} ${suffix}`);
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
    public stars: SolarSystem[][]
  ) {}

  private static shuffleInPlace(values: string[]): void {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
  }
}
