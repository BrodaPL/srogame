import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  GameStateResponse,
  StartGameRequest,
  StartGameResponse
} from '../models/game-api-types';

const API_BASE_URL = 'http://localhost:3000/api';

@Injectable({
  providedIn: 'root'
})
export class GameApiService {
  constructor(private readonly http: HttpClient) {}

  public startGame(request: StartGameRequest) {
    return this.http.post<StartGameResponse>(`${API_BASE_URL}/game/start`, request);
  }

  public getGameState(token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    return this.http.get<GameStateResponse>(`${API_BASE_URL}/game/state`, { headers });
  }
}
