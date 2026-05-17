import type { ClientCoordinates } from '../../../../src/app/models/game-api-types.ts';

export function readV2ProposalCoordinates(value: unknown): ClientCoordinates | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const z = Number(record.z);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return null;
  }

  return {
    x,
    y,
    z: Math.max(0, z - 1)
  };
}
