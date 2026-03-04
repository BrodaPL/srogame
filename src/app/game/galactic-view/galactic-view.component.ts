import { Component } from '@angular/core';
import { GameStateService } from '../../core/game-state.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

@Component({
  selector: 'app-galactic-view',
  imports: [TopMenuComponent],
  templateUrl: './galactic-view.component.html'
})
export class GalacticViewComponent {
  protected readonly gridCellSize = 22;

  constructor(protected readonly gameState: GameStateService) {}
}
