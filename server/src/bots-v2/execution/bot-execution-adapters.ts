import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../src/app/models/enums/defence-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
import type { ClientCoordinates } from '../../../../src/app/models/game-api-types.ts';
import type { StartBuildingConstructionCommand } from '../../game-commands/building-commands.ts';
import type { StartTechnologyResearchCommand } from '../../game-commands/research-commands.ts';
import type { StartShipyardConstructionCommand } from '../../game-commands/shipyard-commands.ts';
import type { BotProposal } from '../bot-v2-types.ts';

export type BotQueueExecutionKind = 'BUILDING' | 'RESEARCH' | 'SHIPYARD';

export type BotQueueExecutionCommand =
  | {
    kind: 'BUILDING';
    command: StartBuildingConstructionCommand;
  }
  | {
    kind: 'RESEARCH';
    command: StartTechnologyResearchCommand;
  }
  | {
    kind: 'SHIPYARD';
    command: StartShipyardConstructionCommand;
  };

export type BotQueueExecutionAdapterResult =
  | {
    ok: true;
    value: BotQueueExecutionCommand;
  }
  | {
    ok: false;
    reason: string;
  };

export function normalizeQueueExecutionProposal(proposal: BotProposal): BotQueueExecutionAdapterResult {
  if (proposal.kind === 'BUILDING') {
    return normalizeBuildingProposal(proposal);
  }
  if (proposal.kind === 'RESEARCH') {
    return normalizeResearchProposal(proposal);
  }
  if (proposal.kind === 'SHIPYARD') {
    return normalizeShipyardProposal(proposal);
  }

  return {
    ok: false,
    reason: 'unsupported_execution_kind'
  };
}

function normalizeBuildingProposal(proposal: BotProposal): BotQueueExecutionAdapterResult {
  const coordinates = readCoordinates(proposal.requestPayload);
  if (!coordinates) {
    return { ok: false, reason: 'missing_coordinates' };
  }
  if (!isBuildingType(proposal.requestPayload.buildingType)) {
    return { ok: false, reason: 'missing_or_invalid_building_type' };
  }

  return {
    ok: true,
    value: {
      kind: 'BUILDING',
      command: {
        ...coordinates,
        buildingType: proposal.requestPayload.buildingType
      }
    }
  };
}

function normalizeResearchProposal(proposal: BotProposal): BotQueueExecutionAdapterResult {
  const coordinates = readCoordinates(proposal.requestPayload);
  if (!coordinates) {
    return { ok: false, reason: 'missing_coordinates' };
  }
  if (!isTechnologyType(proposal.requestPayload.technologyType)) {
    return { ok: false, reason: 'missing_or_invalid_technology_type' };
  }

  const helperPlanets = Array.isArray(proposal.requestPayload.helperPlanets)
    ? proposal.requestPayload.helperPlanets
      .map((entry) => readCoordinates(entry))
      .filter((entry): entry is ClientCoordinates => entry !== null)
    : [];

  return {
    ok: true,
    value: {
      kind: 'RESEARCH',
      command: {
        ...coordinates,
        technologyType: proposal.requestPayload.technologyType,
        helperPlanets
      }
    }
  };
}

function normalizeShipyardProposal(proposal: BotProposal): BotQueueExecutionAdapterResult {
  if (proposal.requestPayload.demandOnly === true) {
    return { ok: false, reason: 'ship_need_pressure_only' };
  }

  const coordinates = readCoordinates(proposal.requestPayload);
  if (!coordinates) {
    return { ok: false, reason: 'missing_coordinates' };
  }
  const itemKind = proposal.requestPayload.itemKind;
  const amount = Number(proposal.requestPayload.amount);
  if ((itemKind !== 'ship' && itemKind !== 'defence') || !Number.isFinite(amount) || amount < 1) {
    return { ok: false, reason: 'missing_or_invalid_shipyard_item' };
  }

  if (itemKind === 'ship') {
    if (!isShipType(proposal.requestPayload.shipType)) {
      return { ok: false, reason: 'missing_or_invalid_ship_type' };
    }

    return {
      ok: true,
      value: {
        kind: 'SHIPYARD',
        command: {
          ...coordinates,
          itemKind: 'ship',
          shipType: proposal.requestPayload.shipType,
          amount: Math.floor(amount)
        }
      }
    };
  }

  if (!isDefenceType(proposal.requestPayload.defenceType)) {
    return { ok: false, reason: 'missing_or_invalid_defence_type' };
  }

  return {
    ok: true,
    value: {
      kind: 'SHIPYARD',
      command: {
        ...coordinates,
        itemKind: 'defence',
        defenceType: proposal.requestPayload.defenceType,
        amount: Math.floor(amount)
      }
    }
  };
}

function readCoordinates(value: unknown): ClientCoordinates | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const source = record.targetCoordinates && typeof record.targetCoordinates === 'object'
    ? record.targetCoordinates as Record<string, unknown>
    : record;
  const x = Number(source.x);
  const y = Number(source.y);
  const z = Number(source.z);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return null;
  }

  return { x, y, z };
}

function isBuildingType(value: unknown): value is BuildingType {
  return typeof value === 'string' && Object.values(BuildingType).includes(value as BuildingType);
}

function isTechnologyType(value: unknown): value is TechnologyType {
  return typeof value === 'string' && Object.values(TechnologyType).includes(value as TechnologyType);
}

function isShipType(value: unknown): value is ShipType {
  return typeof value === 'string' && Object.values(ShipType).includes(value as ShipType);
}

function isDefenceType(value: unknown): value is DefenceType {
  return typeof value === 'string' && Object.values(DefenceType).includes(value as DefenceType);
}
