export type GameCommandErrorCode =
  | 'INVALID_INPUT'
  | 'PLAYER_NOT_FOUND'
  | 'SYSTEM_NOT_FOUND'
  | 'PLANET_NOT_FOUND'
  | 'FORBIDDEN'
  | 'QUEUE_FULL'
  | 'REQUIREMENTS_NOT_MET'
  | 'TECH_REQUIREMENTS_NOT_MET'
  | 'INSUFFICIENT_RESOURCES'
  | 'ACTIVE_FLEET_LIMIT'
  | 'MISSION_INVALID'
  | 'JUMP_GATE_INVALID'
  | 'CONFLICT';

export type GameCommandError = {
  status: 400 | 403 | 404 | 409;
  code: GameCommandErrorCode;
  message: string;
};

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GameCommandError };
