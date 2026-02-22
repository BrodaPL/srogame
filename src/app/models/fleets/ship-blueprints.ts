import { Ship } from './ship';
import { TechnologyType } from '../enums/technology-type';

export class ShipBlueprints {
  constructor(public shipsMap: Map<string, Ship> = new Map()) {

  }

  add(ship: Ship): void {
    this.shipsMap.set(ship.name, ship);
  }

  get(name: string): Ship | undefined {
    return this.shipsMap.get(name);
  }

  techUpdate(tech: TechnologyType): void {
    for (const _ship of this.shipsMap.values()) {
      switch (tech) {
        case TechnologyType.ENERGY_TECHNOLOGY:
        case TechnologyType.WAVE_PARTICLE_TECHNOLOGY:
        case TechnologyType.MATERIAL_TECHNOLOGY:
        case TechnologyType.HYPERSPACE_TECHNOLOGY:
        case TechnologyType.ESPIONAGE_TECHNOLOGY:
        case TechnologyType.COMPUTER_TECHNOLOGY:
        case TechnologyType.ASTROPHYSICS_TECHNOLOGY:
        case TechnologyType.INTERGALACTIC_RESEARCH_NETWORK:
        case TechnologyType.GRAVITON_TECHNOLOGY:
        case TechnologyType.SHIELDING_TECHNOLOGY:
        case TechnologyType.ARMOUR_TECHNOLOGY:
        case TechnologyType.RAILGUNS_WEAPONS:
        case TechnologyType.BEAMS_WEAPONS:
        case TechnologyType.MISSILES_WEAPONS:
        case TechnologyType.FUSION_DRIVE:
        case TechnologyType.HYPERSPACE_DRIVE:
        default:
          break;
      }
    }

  }
}

