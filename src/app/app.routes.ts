import { Routes } from '@angular/router';
import { EncyclopediaBuildingsComponent } from './encyclopedia-menu/encyclopedia-buildings.component';
import { EncyclopediaMenuComponent } from './encyclopedia-menu/encyclopedia-menu.component';
import { EncyclopediaShipsComponent } from './encyclopedia-menu/encyclopedia-ships.component';
import { EncyclopediaTechnologiesComponent } from './encyclopedia-menu/encyclopedia-technologies.component';
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
  { path: 'encyclopedia', component: EncyclopediaMenuComponent },
  { path: 'encyclopedia/ships', component: EncyclopediaShipsComponent },
  { path: 'encyclopedia/buildings', component: EncyclopediaBuildingsComponent },
  { path: 'encyclopedia/technologies', component: EncyclopediaTechnologiesComponent },
  { path: 'game', component: GameComponent },
  { path: '**', redirectTo: '' }
];
