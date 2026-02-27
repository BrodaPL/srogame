import { Routes } from '@angular/router';
import { EncyclopediaBuildingsComponent } from './encyclopedia-menu/encyclopedia-buildings.component';
import { EncyclopediaMechanicsComponent } from './encyclopedia-menu/encyclopedia-mechanics.component';
import { EncyclopediaMenuComponent } from './encyclopedia-menu/encyclopedia-menu.component';
import { EncyclopediaShipsComponent } from './encyclopedia-menu/encyclopedia-ships.component';
import { EncyclopediaTechnologiesComponent } from './encyclopedia-menu/encyclopedia-technologies.component';
import { AuthComponent } from './auth/auth.component';
import { GameComponent } from './game/game.component';
import { EmpireOverviewComponent } from './game/empire-overview/empire-overview.component';
import { GalaxyPreviewComponent } from './game/galaxy-preview/galaxy-preview.component';
import { ReportsComponent } from './game/reports/reports.component';
import { TechOverviewComponent } from './game/tech-overview/tech-overview.component';
import { HelpAboutComponent } from './help-about/help-about.component';
import { LoadGameComponent } from './load-game/load-game.component';
import { MainMenuComponent } from './main-menu/main-menu.component';
import { MultiplayerComponent } from './multiplayer/multiplayer.component';
import { GalaxySetupComponent } from './setup/galaxy.setup.component';

export const routes: Routes = [
  { path: '', component: MainMenuComponent },
  { path: 'login', component: AuthComponent },
  { path: 'setup', component: GalaxySetupComponent },
  { path: 'load', component: LoadGameComponent },
  { path: 'multiplayer', component: MultiplayerComponent },
  { path: 'help', component: HelpAboutComponent },
  { path: 'encyclopedia', component: EncyclopediaMenuComponent },
  { path: 'encyclopedia/ships', component: EncyclopediaShipsComponent },
  { path: 'encyclopedia/buildings', component: EncyclopediaBuildingsComponent },
  { path: 'encyclopedia/technologies', component: EncyclopediaTechnologiesComponent },
  { path: 'encyclopedia/mechanics', component: EncyclopediaMechanicsComponent },
  {
    path: 'game',
    component: GameComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: EmpireOverviewComponent },
      { path: 'galaxy', component: GalaxyPreviewComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'tech', component: TechOverviewComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
