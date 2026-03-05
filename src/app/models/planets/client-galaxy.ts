import { ClientStarSystem } from './client-star-system';

export class ClientGalaxy {
  constructor(
    public name: string,
    public stars: ClientStarSystem[][],
    public playerNameMap: Map<number, string>
  ) {}
}
