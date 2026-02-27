import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  GameStateResponse,
  StartGameRequest,
  StartGameResponse
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

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
}
