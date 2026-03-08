import { Routes } from '@angular/router';
import { EncyclopediaBuildingsComponent } from './encyclopedia-menu/encyclopedia-buildings.component';
import { EncyclopediaMechanicsComponent } from './encyclopedia-menu/encyclopedia-mechanics.component';
import { EncyclopediaMenuComponent } from './encyclopedia-menu/encyclopedia-menu.component';
import { EncyclopediaShipsComponent } from './encyclopedia-menu/encyclopedia-ships.component';
import { EncyclopediaTechnologiesComponent } from './encyclopedia-menu/encyclopedia-technologies.component';
import { AuthComponent } from './auth/auth.component';
import { GameComponent } from './game/game.component';
import { BuildingsViewComponent } from './game/buildings-view/buildings-view.component';
import { DefenceViewComponent } from './game/defence-view/defence-view.component';
import { GalacticViewComponent } from './game/galactic-view/galactic-view.component';
import { ImperiumViewComponent } from './game/imperium-view/imperium-view.component';
import { OperationsViewComponent } from './game/operations-view/operations-view.component';
import { PlanetViewComponent } from './game/planet-view/planet-view.component';
import { ProductionViewComponent } from './game/production-view/production-view.component';
import { ReportsViewComponent } from './game/reports-view/reports-view.component';
import { ResearchesViewComponent } from './game/researches-view/researches-view.component';
import { SendFleetViewComponent } from './game/send-fleet-view/send-fleet-view.component';
import { StarSystemViewComponent } from './game/star-system-view/star-system-view.component';
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
      { path: '', redirectTo: 'galactic', pathMatch: 'full' },
      { path: 'galactic', component: GalacticViewComponent },
      { path: 'imperium', component: ImperiumViewComponent },
      { path: 'star-system', component: StarSystemViewComponent },
      { path: 'planet', component: PlanetViewComponent },
      { path: 'reports', component: ReportsViewComponent },
      { path: 'researches', component: ResearchesViewComponent },
      { path: 'production', component: ProductionViewComponent },
      { path: 'buildings', component: BuildingsViewComponent },
      { path: 'defence', component: DefenceViewComponent },
      { path: 'operations', component: OperationsViewComponent },
      { path: 'send-fleet', component: SendFleetViewComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
