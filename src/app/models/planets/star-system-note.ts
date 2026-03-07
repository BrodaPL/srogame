import { NoteBorderColor } from '../enums/note-border-color';
import type { SolarSystemCoordinates } from './solar-system';

export class StarSystemNote {
  constructor(
    public coordinates: SolarSystemCoordinates,
    public borderColor: NoteBorderColor,
    public text: string
  ) {}
}
