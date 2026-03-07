import { NoteBorderColor } from '../enums/note-border-color';

export class StarSystemNote {
  constructor(
    public borderColor: NoteBorderColor,
    public text: string
  ) {}
}
