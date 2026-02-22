import { Injectable } from '@angular/core';
import { PlayerSession } from '../models/game-api-types';

@Injectable({
  providedIn: 'root'
})
export class PlayerSessionService {
  private readonly storageKey = 'srogame:player';

  public load(): PlayerSession | null {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored) as PlayerSession;
      if (this.isValid(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
  }

  public save(session: PlayerSession): void {
    localStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  public clear(): void {
    localStorage.removeItem(this.storageKey);
  }

  private isValid(session: PlayerSession): boolean {
    return (
      !!session &&
      Number.isInteger(session.id) &&
      session.id >= 0 &&
      typeof session.name === 'string' &&
      session.name.trim().length > 0 &&
      typeof session.token === 'string' &&
      session.token.trim().length > 0
    );
  }
}
