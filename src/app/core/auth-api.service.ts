import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_BASE_URL } from './api-constants';
import {
  LoginRequest,
  RegisterRequest,
  PlayerSession
} from '../models/game-api-types';

@Injectable({
  providedIn: 'root'
})
export class AuthApiService {
  constructor(private readonly http: HttpClient) {}

  public register(request: RegisterRequest) {
    return this.http.post<PlayerSession>(`${API_BASE_URL}/auth/register`, request);
  }

  public login(request: LoginRequest) {
    return this.http.post<PlayerSession>(`${API_BASE_URL}/auth/login`, request);
  }

  public me(token: string) {
    return this.http.get<PlayerSession>(`${API_BASE_URL}/auth/me`, {
      headers: this.authHeaders(token)
    });
  }

  public logout(token: string) {
    return this.http.post<void>(
      `${API_BASE_URL}/auth/logout`,
      {},
      { headers: this.authHeaders(token) }
    );
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }
}
