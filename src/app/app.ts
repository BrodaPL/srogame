import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStateService } from './core/auth-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {
  constructor(private readonly authState: AuthStateService) {
    this.authState.init();
  }
}
