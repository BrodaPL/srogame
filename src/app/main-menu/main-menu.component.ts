import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';

@Component({
  selector: 'app-main-menu',
  imports: [RouterLink],
  templateUrl: './main-menu.component.html'
})
export class MainMenuComponent {
  protected readonly session: AuthStateService['session'];

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService
  ) {
    this.session = this.authState.session;
  }

  protected logout(): void {
    const session = this.session();
    if (!session) {
      return;
    }

    this.authApi.logout(session.token).subscribe({
      next: () => {
        this.authState.clearSession();
      },
      error: () => {
        this.authState.clearSession();
      }
    });
  }
}
