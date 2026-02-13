import { Routes } from '@angular/router';
import { GameComponent } from './game/game.component';
import { SetupComponent } from './setup/setup.component';

export const routes: Routes = [
  { path: '', component: SetupComponent },
  { path: 'game', component: GameComponent },
  { path: '**', redirectTo: '' }
];
