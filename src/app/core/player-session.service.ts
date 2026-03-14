import { Injectable } from '@angular/core';
import { PlayerSession } from '../models/game-api-types';
import { normalizeTutorialReadState } from '../tutorial/tutorial-types';

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
        return {
          ...parsed,
          tutorialRead: normalizeTutorialReadState(
            (parsed as Partial<PlayerSession>).tutorialRead,
            false
          )
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  public save(session: PlayerSession): void {
    localStorage.setItem(this.storageKey, JSON.stringify({
      ...session,
      tutorialRead: normalizeTutorialReadState(session.tutorialRead, false)
    }));
  }

  public clear(): void {
    localStorage.removeItem(this.storageKey);
  }

  private isValid(session: PlayerSession): boolean {
    return (
      !!session &&
      Number.isInteger(session.id) &&
      session.id >= 0 &&
      typeof session.playerName === 'string' &&
      session.playerName.trim().length > 0 &&
      typeof session.token === 'string' &&
      session.token.trim().length > 0
    );
  }
}
