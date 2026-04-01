import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  EndTurnResponse,
  GameStateResponse,
  GameSaveSummaryResponse,
  LoadGameResponse,
  StartGameRequest,
  StartGameResponse,
  ClientGalaxyDto,
  ClientStarSystemDto,
  ClientPlanetDto,
  GalaxyPresentationDataDto,
  UpsertStarSystemNoteRequest,
  StarSystemNoteDto,
  SetBuildingPowerConsumptionRequest,
  SetBuildingPowerConsumptionResponse,
  StartBuildingConstructionRequest,
  ReorderBuildingQueueRequest,
  CancelBuildingQueueEntryRequest,
  StartShipyardConstructionRequest,
  ReorderShipyardQueueRequest,
  CancelShipyardQueueEntryRequest,
  StartTechnologyResearchRequest,
  CreateFleetMissionRequest,
  CreateFleetMissionResponse,
  CreateMaintenanceRequestRequest,
  CreateMaintenanceRequestResponse,
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
  SendMailMessageRequest,
  SendMailMessageResponse,
  AbandonPlanetRequest,
  AbandonPlanetResponse,
  UseTradePortOfferRequest,
  SensorPhalanxCapabilitiesDto,
  SensorPhalanxScanRequest,
  SensorPhalanxScanResponse
} from '../models/game-api-types';
import { API_BASE_URL } from './api-constants';

@Injectable({
  providedIn: 'root'
})
export class GameApiService {
  constructor(private readonly http: HttpClient) {}

  public startGame(request: StartGameRequest, token: string) {
    return this.http.post<StartGameResponse>(
      `${API_BASE_URL}/game/start`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public getGameState(token: string) {
    return this.http.get<GameStateResponse>(
      `${API_BASE_URL}/game/state`,
      { headers: this.authHeaders(token) }
    );
  }

  public getGameSaveSummary(token?: string) {
    return this.http.get<GameSaveSummaryResponse>(
      `${API_BASE_URL}/game/save-summary`,
      token ? { headers: this.authHeaders(token) } : {}
    );
  }

  public loadGame(token: string) {
    return this.http.post<LoadGameResponse>(
      `${API_BASE_URL}/game/load`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  public endTurn(token: string) {
    return this.http.post<EndTurnResponse>(
      `${API_BASE_URL}/game/end-turn`,
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

  public getClientPlanet(x: number, y: number, z: number, token: string) {
    return this.http.get<ClientPlanetDto>(
      `${API_BASE_URL}/game/client-planet`,
      {
        headers: this.authHeaders(token),
        params: { x, y, z }
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
