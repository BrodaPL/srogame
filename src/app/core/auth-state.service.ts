import { Injectable, signal } from '@angular/core';
import { PlayerSession } from '../models/game-api-types';
import { PlayerSessionService } from './player-session.service';
import { AuthApiService } from './auth-api.service';
import { GameStateService } from './game-state.service';

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private readonly sessionSignal = signal<PlayerSession | null>(null);
  private initialized = false;

  public readonly session = this.sessionSignal.asReadonly();

  constructor(
    private readonly playerSession: PlayerSessionService,
    private readonly authApi: AuthApiService,
    private readonly gameState: GameStateService
  ) {}

  public init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    const stored = this.playerSession.load();
    if (!stored) {
      return;
    }

    this.sessionSignal.set(stored);
    this.authApi.me(stored.token).subscribe({
      next: (session) => {
        this.setSession(session);
      },
      error: () => {
        this.clearSession();
      }
    });
  }

  public setSession(session: PlayerSession): void {
    this.playerSession.save(session);
    this.gameState.setCurrentGameId(session.currentGameId);
    this.sessionSignal.set(session);
  }

  public clearSession(): void {
    this.playerSession.clear();
    this.gameState.clearGalaxy();
    this.sessionSignal.set(null);
  }
}
