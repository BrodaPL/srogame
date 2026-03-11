export class Destination {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}

  public toLabel(): string {
    return `${this.x}:${this.y}:${this.z}`;
  }
}
