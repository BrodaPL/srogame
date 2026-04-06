import type { MultiplayerLobbyDto, MultiplayerLobbyResponse } from '../models/game-api-types';

export function shouldAutoEnterStartedMultiplayerGame(
  previousLobby: MultiplayerLobbyDto | null | undefined,
  nextResponse: MultiplayerLobbyResponse
): boolean {
  return previousLobby?.isMember === true
    && nextResponse.lobby === null
    && nextResponse.activeGame !== null;
}
