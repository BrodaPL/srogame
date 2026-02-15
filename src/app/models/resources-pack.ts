import { Logger } from '../core/logger';

export class ResourcesPack {
  constructor(
    public metal: number,
    public crystal: number,
    public deuterium: number
  ) {}

  private nullCheck(pack: ResourcesPack, someString: string): boolean {
    if(pack === null) {
      Logger.error('ResourcesPack received in '+someString+' has null value!');
      return false;
    }else if(!Number.isFinite(pack.metal) ||
      !Number.isFinite(pack.crystal) ||
      !Number.isFinite(pack.deuterium)) {
      Logger.error('ResourcesPack received in '+someString+' has infinite value!');
      return false;
    }
    return true;
  }

  public addResourcePack(pack: ResourcesPack): void {
    if (!this.nullCheck(pack, 'addResourcePack')) {
      return;
    }

    this.metal += pack.metal;
    this.crystal += pack.crystal;
    this.deuterium += pack.deuterium;
  }

  public subtractResourcePack(pack: ResourcesPack): void {
    if (!this.nullCheck(pack, 'subtractResourcePack')) {
      return;
    }

    this.metal -= pack.metal;
    this.crystal -= pack.crystal;
    this.deuterium -= pack.deuterium;
  }

  public isSufficient(pack: ResourcesPack): boolean {
    if (!this.nullCheck(pack, 'isSufficient')) {
      return false;
    }

    return (
      this.metal - pack.metal >= 0 &&
      this.crystal - pack.crystal >= 0 &&
      this.deuterium - pack.deuterium >= 0
    );
  }
}
