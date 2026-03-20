import { DiplomaticStatus } from './diplomatic-status';
import {
  createDiplomaticRelation,
  type DiplomaticRelation
} from './diplomatic-relation';

export class DiplomacyResolver {
  private readonly relationByPairKey = new Map<string, DiplomaticStatus>();

  constructor(relations: DiplomaticRelation[] = []) {
    for (const relation of relations) {
      this.setStatus(relation.playerAId, relation.playerBId, relation.status);
    }
  }

  public getStatus(
    leftOwnerId: number | null,
    rightOwnerId: number | null
  ): DiplomaticStatus {
    if (leftOwnerId !== null && rightOwnerId !== null && leftOwnerId === rightOwnerId) {
      return DiplomaticStatus.SELF;
    }

    if (leftOwnerId === null || rightOwnerId === null) {
      return DiplomaticStatus.WAR;
    }

    const relation = this.relationByPairKey.get(this.toPairKey(leftOwnerId, rightOwnerId));
    if (relation) {
      return relation;
    }

    return DiplomaticStatus.WAR;
  }

  public setStatus(
    leftOwnerId: number,
    rightOwnerId: number,
    status: DiplomaticStatus
  ): void {
    if (leftOwnerId === rightOwnerId) {
      return;
    }

    if (status === DiplomaticStatus.WAR) {
      this.relationByPairKey.delete(this.toPairKey(leftOwnerId, rightOwnerId));
      return;
    }

    this.relationByPairKey.set(this.toPairKey(leftOwnerId, rightOwnerId), status);
  }

  public toRelations(): DiplomaticRelation[] {
    const relations: DiplomaticRelation[] = [];
    for (const [pairKey, status] of this.relationByPairKey.entries()) {
      const [leftId, rightId] = pairKey.split(':').map((value) => Number.parseInt(value, 10));
      if (!Number.isInteger(leftId) || !Number.isInteger(rightId)) {
        continue;
      }

      relations.push(createDiplomaticRelation(leftId, rightId, status));
    }

    return relations.sort((left, right) =>
      left.playerAId - right.playerAId || left.playerBId - right.playerBId
    );
  }

  private toPairKey(leftOwnerId: number, rightOwnerId: number): string {
    const first = Math.min(leftOwnerId, rightOwnerId);
    const second = Math.max(leftOwnerId, rightOwnerId);
    return `${first}:${second}`;
  }
}
