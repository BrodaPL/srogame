import { SolarSystemCoordinates } from './solar-system';

export class StarSystemNote {
  constructor(
    public color: string,
    public note: string,
    public coordinate: SolarSystemCoordinates
  ) {}
}
