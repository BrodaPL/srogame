import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStateService } from './core/auth-state.service';
import { I18nService } from './i18n/i18n.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {
  constructor(
    private readonly authState: AuthStateService,
    private readonly i18n: I18nService
  ) {
    this.authState.init();
    this.i18n.init();
  }
}
