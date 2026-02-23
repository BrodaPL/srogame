import { PlanetType } from '../enums/planet-type';

export type PlanetViewKey = 'resources' | 'facilities';

export interface PlanetViewImages {
  resources: string;
  facilities: string;
}

export const PLANET_TYPE_IMAGES: Record<PlanetType, PlanetViewImages> = {
  [PlanetType.BARREN]: {
    resources: 'images/planet_view/Barren_Planet_Resources.webp',
    facilities: 'images/planet_view/Barren_Planet_Facilities.webp'
  },
  [PlanetType.DRY]: {
    resources: 'images/planet_view/Dry_Planet_Resources.webp',
    facilities: 'images/planet_view/Dry_Planet_Facilities.webp'
  },
  [PlanetType.ICE]: {
    resources: 'images/planet_view/Ice_Planet_Resources.webp',
    facilities: 'images/planet_view/Ice_Planet_Facilities_Full.webp'
  },
  [PlanetType.JUNGLE]: {
    resources: 'images/planet_view/Jungle_Planet_Resources.webp',
    facilities: 'images/planet_view/Jungle_Planet_Facilities.webp'
  },
  [PlanetType.SAVANNA]: {
    resources: 'images/planet_view/Savanna_Planet_Resources.webp',
    facilities: 'images/planet_view/Savanna_Planet_Facilities.webp'
  },
  [PlanetType.OCEANIC]: {
    resources: 'images/planet_view/Oceanic_Planet_Resources.webp',
    facilities: 'images/planet_view/Oceanic_Planet_Facilities.webp'
  },
  [PlanetType.VOLCANIC]: {
    resources: 'images/planet_view/Volcanic_Planet_Resources.png',
    facilities: 'images/planet_view/Volcanic_Planet_Facilities.png'
  },
  [PlanetType.ASTEROIDS]: {
    resources: 'images/planet_view/Asteroid_Planet_Resources.webp',
    facilities: 'images/planet_view/Asteroid_Planet_Facilities.webp'
  }
};
