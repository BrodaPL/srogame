import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  BotAdminActionResponse,
  BotAdminStatesResponse,
  BotDecisionTracesResponse,
  CurrentGameStatusResponse,
  EndTurnResponse,
  GameListResponse,
  GameStateResponse,
  GameSavesResponse,
  LeaveCurrentMultiplayerGameResponse,
  LoadGameResponse,
  MultiplayerGameBrowserResponse,
  MultiplayerGameDetailResponse,
  StartGameRequest,
  StartGameResponse,
  ClientGalaxyDto,
  ClientStarSystemDto,
  ClientPlanetDto,
  GalaxyPresentationDataDto,
  UpsertStarSystemNoteRequest,
  UpdateBotProfileRequest,
  StarSystemNoteDto,
  SetBuildingPowerConsumptionRequest,
  SetBuildingPowerConsumptionResponse,
  SetFusionReactorStageRequest,
  SetFusionReactorStageResponse,
  StartBuildingConstructionRequest,
  ReorderBuildingQueueRequest,
  CancelBuildingQueueEntryRequest,
  StartShipyardConstructionRequest,
  ReorderShipyardQueueRequest,
  CancelShipyardQueueEntryRequest,
  StartTechnologyResearchRequest,
  UpdateResearchHelpersRequest,
  CreateFleetMissionRequest,
  CreateFleetMissionResponse,
  CreateStarSystemSpyRequest,
  CreateStarSystemSpyResponse,
  CreateMaintenanceRequestRequest,
  CreateMaintenanceRequestResponse,
  CreateSupportRequestRequest,
  DeletePlayerReportsRequest,
  DeletePlayerReportsResponse,
  FleetMaintenanceOptionsDto,
  MarkPlayerReportReadRequest,
  MarkMailMessageReadRequest,
  DeleteMailMessagesRequest,
  DeleteMailMessagesResponse,
  DeleteMailRequestsRequest,
  DeleteMailRequestsResponse,
  MarkTutorialReadRequest,
  PlayerReportDto,
  PlayerSession,
  DiplomaticRelationDto,
  SetDiplomaticRelationRequest,
  DiplomacyViewResponse,
  CreateDiplomaticProposalRequest,
  MailViewResponse,
  ResolveMaintenanceRequestRequest,
  ResolveSupportRequestRequest,
  SendMailMessageRequest,
  SendMailMessageResponse,
  AbandonPlanetRequest,
  AbandonPlanetResponse,
  UseTradePortOfferRequest,
  SensorPhalanxCapabilitiesDto,
  SensorPhalanxScanRequest,
  SensorPhalanxScanResponse,
  TurnStatusResponse,
  UpdateMultiplayerAutoSkipTurnRequest,
  UpdateMultiplayerLobbySetupRequest,
  ToggleMultiplayerLobbyReadyRequest,
  AssignMultiplayerLobbySeatRequest,
  BindMultiplayerLobbySaveRequest
} from '../models/game-api-types';
import { API_BASE_URL } from './api-constants';

@Injectable({
  providedIn: 'root'
})
export class GameApiService {
  constructor(private readonly http: HttpClient) {}

  public getGames(token: string) {
    return this.http.get<GameListResponse>(
      `${API_BASE_URL}/games`,
      { headers: this.authHeaders(token) }
    );
  }

  public getCurrentGameStatus(token: string) {
    return this.http.get<CurrentGameStatusResponse>(
      `${API_BASE_URL}/games/current`,
      { headers: this.authHeaders(token) }
    );
  }

  public selectGame(gameId: string, token: string) {
    return this.http.post<CurrentGameStatusResponse>(
      `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/select`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public closeCurrentGame(gameId: string, token: string) {
    return this.http.post<CurrentGameStatusResponse>(
      `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/close-current`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public startGame(request: StartGameRequest, token: string) {
    return this.http.post<StartGameResponse>(
      `${API_BASE_URL}/game/start`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public getGameState(token: string, gameId?: string | null) {
    return this.http.get<GameStateResponse>(
      gameId
        ? `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/state`
        : `${API_BASE_URL}/game/state`,
      { headers: this.authHeaders(token) }
    );
  }

  public getGameSaves(token?: string, gameId?: string | null) {
    return this.http.get<GameSavesResponse>(
      gameId
        ? `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/saves`
        : `${API_BASE_URL}/game/saves`,
      token ? { headers: this.authHeaders(token) } : {}
    );
  }

  public loadGame(saveId: string, token: string) {
    return this.http.post<LoadGameResponse>(
      `${API_BASE_URL}/game/saves/${encodeURIComponent(saveId)}/load`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public deleteGameSave(saveId: string, token: string) {
    return this.http.delete<void>(
      `${API_BASE_URL}/game/saves/${encodeURIComponent(saveId)}`,
      { headers: this.authHeaders(token) }
    );
  }

  public getMultiplayerGames(token?: string) {
    return this.http.get<MultiplayerGameBrowserResponse>(
      `${API_BASE_URL}/multiplayer/games`,
      token ? { headers: this.authHeaders(token) } : {}
    );
  }

  public createMultiplayerGame(token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public getMultiplayerGameDetail(gameId: string, token?: string) {
    return this.http.get<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}`,
      token ? { headers: this.authHeaders(token) } : {}
    );
  }

  public joinMultiplayerGame(gameId: string, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/join`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public leaveMultiplayerLobby(gameId: string, token: string) {
    return this.http.post<MultiplayerGameDetailResponse | null>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/leave-lobby`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public leaveCurrentMultiplayerGame(gameId: string, token: string) {
    return this.http.post<LeaveCurrentMultiplayerGameResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/leave-current-game`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public setMultiplayerGameReady(gameId: string, request: ToggleMultiplayerLobbyReadyRequest, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/ready`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public updateMultiplayerGamePresence(
    gameId: string,
    request: Pick<UpdateMultiplayerAutoSkipTurnRequest, 'acknowledgeNotice' | 'acknowledgePresenceRemovedNotice'>,
    token: string
  ) {
    return this.http.post<TurnStatusResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/presence`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public reopenMultiplayerResumeLobby(gameId: string, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/resume-lobby`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public archiveMultiplayerGame(gameId: string, token: string) {
    return this.http.post<void>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/archive`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public updateMultiplayerAutoSkipTurn(gameId: string, request: UpdateMultiplayerAutoSkipTurnRequest, token: string) {
    return this.http.post<TurnStatusResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/auto-skip-turn`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public updateMultiplayerGameSetup(gameId: string, request: UpdateMultiplayerLobbySetupRequest, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/setup`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public bindMultiplayerGameSave(gameId: string, request: BindMultiplayerLobbySaveRequest, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/bind-save`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public clearMultiplayerGameSave(gameId: string, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/clear-save`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public assignMultiplayerGameSeat(gameId: string, request: AssignMultiplayerLobbySeatRequest, token: string) {
    return this.http.post<MultiplayerGameDetailResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/assign-seat`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public startMultiplayerGame(gameId: string, token: string) {
    return this.http.post<LoadGameResponse>(
      `${API_BASE_URL}/multiplayer/games/${encodeURIComponent(gameId)}/start`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public endTurn(token: string, gameId?: string | null) {
    return this.http.post<EndTurnResponse>(
      gameId
        ? `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/end-turn`
        : `${API_BASE_URL}/game/end-turn`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public getTurnStatus(token: string, gameId?: string | null) {
    return this.http.get<TurnStatusResponse>(
      gameId
        ? `${API_BASE_URL}/games/${encodeURIComponent(gameId)}/turn-status`
        : `${API_BASE_URL}/game/turn-status`,
      { headers: this.authHeaders(token) }
    );
  }

  public getBotDecisionTraces(token: string, playerId?: number) {
    return this.http.get<BotDecisionTracesResponse>(
      `${API_BASE_URL}/admin/bots/traces`,
      {
        headers: this.authHeaders(token),
        params: playerId === undefined ? {} : { playerId }
      }
    );
  }

  public getBotAdminStates(token: string) {
    return this.http.get<BotAdminStatesResponse>(
      `${API_BASE_URL}/admin/bots`,
      { headers: this.authHeaders(token) }
    );
  }

  public setBotProfile(playerId: number, request: UpdateBotProfileRequest, token: string) {
    return this.http.post<BotAdminActionResponse>(
      `${API_BASE_URL}/admin/bots/${playerId}/profile`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public pauseBot(playerId: number, token: string) {
    return this.http.post<BotAdminActionResponse>(
      `${API_BASE_URL}/admin/bots/${playerId}/pause`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public resumeBot(playerId: number, token: string) {
    return this.http.post<BotAdminActionResponse>(
      `${API_BASE_URL}/admin/bots/${playerId}/resume`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public clearBotMemory(playerId: number, token: string) {
    return this.http.post<BotAdminActionResponse>(
      `${API_BASE_URL}/admin/bots/${playerId}/clear-memory`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public getClientGalaxy(token: string, includePlanets = false) {
    return this.http.get<ClientGalaxyDto>(
      `${API_BASE_URL}/game/client-galaxy`,
      {
        headers: this.authHeaders(token),
        params: { includePlanets }
      }
    );
  }

  public getGalaxyPresentationData(token: string) {
    return this.http.get<GalaxyPresentationDataDto>(
      `${API_BASE_URL}/game/galaxy-presentation-data`,
      { headers: this.authHeaders(token) }
    );
  }

  public getClientStarSystem(x: number, y: number, token: string) {
    return this.http.get<ClientStarSystemDto>(
      `${API_BASE_URL}/game/client-star-system`,
      {
        headers: this.authHeaders(token),
        params: { x, y }
      }
    );
  }

  public getClientPlanet(
    x: number,
    y: number,
    z: number,
    token: string,
    options?: { ownedOnly?: boolean }
  ) {
    return this.http.get<ClientPlanetDto>(
      `${API_BASE_URL}/game/client-planet`,
      {
        headers: this.authHeaders(token),
        params: {
          x,
          y,
          z,
          ...(options?.ownedOnly ? { ownedOnly: true } : {})
        }
      }
    );
  }

  public getSensorPhalanxCapabilities(x: number, y: number, z: number, token: string) {
    return this.http.get<SensorPhalanxCapabilitiesDto>(
      `${API_BASE_URL}/game/sensor-phalanx/capabilities`,
      {
        headers: this.authHeaders(token),
        params: { x, y, z }
      }
    );
  }

  public scanSensorPhalanx(request: SensorPhalanxScanRequest, token: string) {
    return this.http.post<SensorPhalanxScanResponse>(
      `${API_BASE_URL}/game/sensor-phalanx/scan`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public getOwnedPlanets(token: string) {
    return this.http.get<ClientPlanetDto[]>(
      `${API_BASE_URL}/game/owned-planets`,
      { headers: this.authHeaders(token) }
    );
  }

  public createOrUpdateStarSystemNote(request: UpsertStarSystemNoteRequest, token: string) {
    return this.http.post<StarSystemNoteDto>(
      `${API_BASE_URL}/game/star-system-note`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public deleteStarSystemNote(x: number, y: number, token: string) {
    return this.http.delete<void>(
      `${API_BASE_URL}/game/star-system-note`,
      {
        headers: this.authHeaders(token),
        params: { x, y }
      }
    );
  }

  public setBuildingPowerConsumption(request: SetBuildingPowerConsumptionRequest, token: string) {
    return this.http.post<SetBuildingPowerConsumptionResponse>(
      `${API_BASE_URL}/game/power-consumption`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public setFusionReactorStage(request: SetFusionReactorStageRequest, token: string) {
    return this.http.post<SetFusionReactorStageResponse>(
      `${API_BASE_URL}/game/fusion-reactor-stage`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public startBuildingConstruction(request: StartBuildingConstructionRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/building-queue`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public reorderBuildingQueue(request: ReorderBuildingQueueRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/building-queue/reorder`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public cancelBuildingQueueEntry(request: CancelBuildingQueueEntryRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/building-queue/cancel`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public startShipyardConstruction(request: StartShipyardConstructionRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/shipyard-queue`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public reorderShipyardQueue(request: ReorderShipyardQueueRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/shipyard-queue/reorder`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public cancelShipyardQueueEntry(request: CancelShipyardQueueEntryRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/shipyard-queue/cancel`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public startTechnologyResearch(request: StartTechnologyResearchRequest, token: string) {
    return this.http.post<ClientPlanetDto[]>(
      `${API_BASE_URL}/game/technology-queue`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public updateResearchHelpers(request: UpdateResearchHelpersRequest, token: string) {
    return this.http.post<ClientPlanetDto[]>(
      `${API_BASE_URL}/game/technology-queue/helpers`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public getActiveFleets(token: string) {
    return this.http.get<CreateFleetMissionResponse['activeFleets']>(
      `${API_BASE_URL}/game/active-fleets`,
      { headers: this.authHeaders(token) }
    );
  }

  public createFleetMission(request: CreateFleetMissionRequest, token: string) {
    return this.http.post<CreateFleetMissionResponse>(
      `${API_BASE_URL}/game/active-fleets`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public createStarSystemSpyMission(request: CreateStarSystemSpyRequest, token: string) {
    return this.http.post<CreateStarSystemSpyResponse>(
      `${API_BASE_URL}/game/star-system-spy`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public returnFleet(fleetId: number, token: string) {
    return this.http.post<CreateFleetMissionResponse['activeFleets']>(
      `${API_BASE_URL}/game/active-fleets/${fleetId}/return`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public delayFleet(fleetId: number, token: string) {
    return this.http.post<CreateFleetMissionResponse['activeFleets']>(
      `${API_BASE_URL}/game/active-fleets/${fleetId}/delay`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public getFleetMaintenanceOptions(fleetId: number, token: string) {
    return this.http.get<FleetMaintenanceOptionsDto>(
      `${API_BASE_URL}/game/active-fleets/${fleetId}/maintenance-options`,
      { headers: this.authHeaders(token) }
    );
  }

  public createMaintenanceRequest(
    fleetId: number,
    request: CreateMaintenanceRequestRequest,
    token: string
  ) {
    return this.http.post<CreateMaintenanceRequestResponse>(
      `${API_BASE_URL}/game/active-fleets/${fleetId}/maintenance-request`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public approveMaintenanceRequest(
    requestId: number,
    request: ResolveMaintenanceRequestRequest | null,
    token: string
  ) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/maintenance-requests/${requestId}/approve`,
      request ?? {},
      { headers: this.authHeaders(token) }
    );
  }

  public rejectMaintenanceRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/maintenance-requests/${requestId}/reject`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public cancelMaintenanceRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/maintenance-requests/${requestId}/cancel`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public approveJumpGateRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/jump-gate-requests/${requestId}/approve`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public rejectJumpGateRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/jump-gate-requests/${requestId}/reject`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public cancelJumpGateRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/jump-gate-requests/${requestId}/cancel`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public getPlayerReports(token: string) {
    return this.http.get<PlayerReportDto[]>(
      `${API_BASE_URL}/game/reports`,
      { headers: this.authHeaders(token) }
    );
  }

  public getMailView(token: string) {
    return this.http.get<MailViewResponse>(
      `${API_BASE_URL}/game/mail`,
      { headers: this.authHeaders(token) }
    );
  }

  public markMailMessageAsRead(request: MarkMailMessageReadRequest, token: string) {
    return this.http.post<void>(
      `${API_BASE_URL}/game/mail/messages/read`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public deleteMailMessages(request: DeleteMailMessagesRequest, token: string) {
    return this.http.post<DeleteMailMessagesResponse>(
      `${API_BASE_URL}/game/mail/messages/delete`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public deleteMailRequests(request: DeleteMailRequestsRequest, token: string) {
    return this.http.post<DeleteMailRequestsResponse>(
      `${API_BASE_URL}/game/mail/requests/delete`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public markPlayerReportAsRead(request: MarkPlayerReportReadRequest, token: string) {
    return this.http.post<PlayerReportDto>(
      `${API_BASE_URL}/game/reports/read`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public deletePlayerReports(request: DeletePlayerReportsRequest, token: string) {
    return this.http.post<DeletePlayerReportsResponse>(
      `${API_BASE_URL}/game/reports/delete`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public markTutorialRead(request: MarkTutorialReadRequest, token: string) {
    return this.http.post<PlayerSession>(
      `${API_BASE_URL}/game/tutorial-read`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public getDiplomaticRelations(token: string) {
    return this.http.get<DiplomaticRelationDto[]>(
      `${API_BASE_URL}/game/diplomacy`,
      { headers: this.authHeaders(token) }
    );
  }

  public setDiplomaticRelation(request: SetDiplomaticRelationRequest, token: string) {
    return this.http.post<DiplomaticRelationDto[]>(
      `${API_BASE_URL}/game/diplomacy`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public getDiplomacyView(token: string) {
    return this.http.get<DiplomacyViewResponse>(
      `${API_BASE_URL}/game/diplomacy-view`,
      { headers: this.authHeaders(token) }
    );
  }

  public createDiplomaticProposal(request: CreateDiplomaticProposalRequest, token: string) {
    return this.http.post<DiplomacyViewResponse>(
      `${API_BASE_URL}/game/diplomacy/proposals`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public createSupportRequest(request: CreateSupportRequestRequest, token: string) {
    return this.http.post<DiplomacyViewResponse>(
      `${API_BASE_URL}/game/diplomacy/support-requests`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public acceptDiplomaticProposal(proposalId: number, token: string) {
    return this.http.post<DiplomacyViewResponse>(
      `${API_BASE_URL}/game/diplomacy/proposals/${proposalId}/accept`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public rejectDiplomaticProposal(proposalId: number, token: string) {
    return this.http.post<DiplomacyViewResponse>(
      `${API_BASE_URL}/game/diplomacy/proposals/${proposalId}/reject`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public cancelDiplomaticProposal(proposalId: number, token: string) {
    return this.http.post<DiplomacyViewResponse>(
      `${API_BASE_URL}/game/diplomacy/proposals/${proposalId}/cancel`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public approveSupportRequest(
    requestId: number,
    request: ResolveSupportRequestRequest | null,
    token: string
  ) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/support-requests/${requestId}/approve`,
      request ?? {},
      { headers: this.authHeaders(token) }
    );
  }

  public rejectSupportRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/support-requests/${requestId}/reject`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public cancelSupportRequest(requestId: number, token: string) {
    return this.http.post<MailViewResponse>(
      `${API_BASE_URL}/game/mail/support-requests/${requestId}/cancel`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public sendMailMessage(request: SendMailMessageRequest, token: string) {
    return this.http.post<SendMailMessageResponse>(
      `${API_BASE_URL}/game/mail/messages/send`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public abandonPlanet(request: AbandonPlanetRequest, token: string) {
    return this.http.post<AbandonPlanetResponse>(
      `${API_BASE_URL}/game/abandon-planet`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public useTradePortOffer(request: UseTradePortOfferRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/trade-port/use-offer`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
}
