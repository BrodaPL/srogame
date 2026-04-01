import { PlanetType } from '../enums/planet-type';

export class PlanetImageHelper {
  private static readonly basePath = 'images/planet_blank';

  static getPlanetImage(type: PlanetType, planetSize: number, variant: 'normal' | 'small' = 'normal'): string {
    const sizeCode = PlanetImageHelper.resolveSizeCode(planetSize);
    return `${PlanetImageHelper.basePath}/${variant}/${type}_${sizeCode}.png`;
  }

  private static resolveSizeCode(planetSize: number): 'S' | 'M' | 'L' {
    if (planetSize < 110) {
      return 'S';
    }

    if (planetSize > 160) {
      return 'L';
    }

    return 'M';
  }
}
