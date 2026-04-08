import { Injectable } from '@angular/core';
import { GalaxySnapshot, TurnStatusResponse } from '../models/game-api-types';
import { DiplomacyResolver } from '../models/diplomacy/diplomacy-resolver';

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  public galaxy: GalaxySnapshot | null = null;
  public turnStatus: TurnStatusResponse | null = null;
  public isProcessingTurn = false;

  public setGalaxy(galaxy: GalaxySnapshot): void {
    this.galaxy = galaxy;
  }

  public setTurnStatus(turnStatus: TurnStatusResponse | null): void {
    this.turnStatus = turnStatus;
  }

  public setProcessingTurn(isProcessingTurn: boolean): void {
    this.isProcessingTurn = isProcessingTurn;
  }

  public currentTurn(): number | null {
    return this.galaxy?.currentTurn ?? null;
  }

  public diplomacyResolver(): DiplomacyResolver {
    return new DiplomacyResolver(this.galaxy?.diplomaticRelations ?? []);
  }

  public clearGalaxy(): void {
    this.galaxy = null;
    this.turnStatus = null;
    this.isProcessingTurn = false;
  }
}
