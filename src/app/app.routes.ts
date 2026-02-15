import { Routes } from '@angular/router';
import { GameComponent } from './game/game.component';
import { HelpAboutComponent } from './help-about/help-about.component';
import { LoadGameComponent } from './load-game/load-game.component';
import { MainMenuComponent } from './main-menu/main-menu.component';
import { MultiplayerComponent } from './multiplayer/multiplayer.component';
import { SetupComponent } from './setup/setup.component';

export const routes: Routes = [
  { path: '', component: MainMenuComponent },
  { path: 'setup', component: SetupComponent },
  { path: 'load', component: LoadGameComponent },
  { path: 'multiplayer', component: MultiplayerComponent },
  { path: 'help', component: HelpAboutComponent },
  { path: 'game', component: GameComponent },
  { path: '**', redirectTo: '' }
];
