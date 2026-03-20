import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  EndTurnResponse,
  GameStateResponse,
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
  StartShipyardConstructionRequest,
  StartTechnologyResearchRequest,
  CreateFleetMissionRequest,
  CreateFleetMissionResponse,
  DeletePlayerReportsRequest,
  DeletePlayerReportsResponse,
  MarkPlayerReportReadRequest,
  MarkTutorialReadRequest,
  PlayerReportDto,
  PlayerSession,
  DiplomaticRelationDto,
  SetDiplomaticRelationRequest
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

  public startShipyardConstruction(request: StartShipyardConstructionRequest, token: string) {
    return this.http.post<ClientPlanetDto>(
      `${API_BASE_URL}/game/shipyard-queue`,
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

  public getPlayerReports(token: string) {
    return this.http.get<PlayerReportDto[]>(
      `${API_BASE_URL}/game/reports`,
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

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
}
