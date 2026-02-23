import { Component } from '@angular/core';
import { GameStateService } from '../../core/game-state.service';

@Component({
  selector: 'app-galaxy-preview',
  templateUrl: './galaxy-preview.component.html'
})
export class GalaxyPreviewComponent {
  protected readonly gridCellSize = 22;

  constructor(protected readonly gameState: GameStateService) {}
}
