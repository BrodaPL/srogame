import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_BASE_URL } from './api-constants';
import {
  AccountSettingsResponse,
  LoginRequest,
  ResendConfirmationRequest,
  ResendConfirmationResponse,
  RegisterRequest,
  RegisterConfigResponse,
  RegisterResponse,
  PlayerSession,
  ResetAccountTutorialsResponse,
  UpdateAccountPreferencesRequest
} from '../models/game-api-types';

@Injectable({
  providedIn: 'root'
})
export class AuthApiService {
  constructor(private readonly http: HttpClient) {}

  public getRegisterConfig() {
    return this.http.get<RegisterConfigResponse>(`${API_BASE_URL}/auth/register-config`);
  }

  public register(request: RegisterRequest) {
    return this.http.post<RegisterResponse>(`${API_BASE_URL}/auth/register`, request);
  }

  public resendConfirmation(request: ResendConfirmationRequest) {
    return this.http.post<ResendConfirmationResponse>(`${API_BASE_URL}/auth/resend-confirmation`, request);
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

  public getAccountSettings(token: string) {
    return this.http.get<AccountSettingsResponse>(
      `${API_BASE_URL}/account/settings`,
      { headers: this.authHeaders(token) }
    );
  }

  public updateAccountPreferences(request: UpdateAccountPreferencesRequest, token: string) {
    return this.http.post<AccountSettingsResponse>(
      `${API_BASE_URL}/account/settings/preferences`,
      request,
      { headers: this.authHeaders(token) }
    );
  }

  public resetAccountTutorials(token: string) {
    return this.http.post<ResetAccountTutorialsResponse>(
      `${API_BASE_URL}/account/settings/tutorials/reset`,
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
