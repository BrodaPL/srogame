import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameStateService } from '../core/game-state.service';

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink],
  templateUrl: './auth.component.html'
})
export class AuthComponent {
  protected loginName = '';
  protected loginPassword = '';
  protected registerName = '';
  protected registerPassword = '';
  protected registerPasswordConfirm = '';
  protected loginError: string | null = null;
  protected registerError: string | null = null;
  protected isLoggingIn = false;
  protected isRegistering = false;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameState: GameStateService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  protected login(): void {
    if (this.isLoggingIn) {
      return;
    }

    const playerName = this.loginName.trim();
    const password = this.loginPassword;
    if (!playerName || !password) {
      this.loginError = 'Player name and password are required.';
      return;
    }

    this.isLoggingIn = true;
    this.loginError = null;

    this.authApi.login({ playerName, password }).subscribe({
      next: (session) => {
        this.gameState.clearGalaxy();
        this.authState.setSession(session);
        this.isLoggingIn = false;
        this.cdr.markForCheck();
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loginError = this.resolveAuthError(err, 'Login failed.');
        this.isLoggingIn = false;
        this.cdr.markForCheck();
      }
    });
  }

  protected register(): void {
    if (this.isRegistering) {
      return;
    }

    const playerName = this.registerName.trim();
    const password = this.registerPassword;
    const confirm = this.registerPasswordConfirm;
    if (!playerName || !password) {
      this.registerError = 'Player name and password are required.';
      return;
    }

    if (password !== confirm) {
      this.registerError = 'Passwords do not match.';
      return;
    }

    this.isRegistering = true;
    this.registerError = null;

    this.authApi.register({ playerName, password }).subscribe({
      next: (session) => {
        this.gameState.clearGalaxy();
        this.authState.setSession(session);
        this.isRegistering = false;
        this.cdr.markForCheck();
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.registerError = this.resolveAuthError(err, 'Registration failed.');
        this.isRegistering = false;
        this.cdr.markForCheck();
      }
    });
  }

  private resolveAuthError(err: unknown, fallback: string): string {
    const errorObj = err as { status?: number; error?: { error?: string } | string };
    const directMessage =
      typeof errorObj?.error === 'string'
        ? errorObj.error
        : errorObj?.error?.error;

    if (directMessage) {
      return directMessage;
    }

    switch (errorObj?.status) {
      case 401:
        return 'Wrong password.';
      case 404:
        return 'No such user.';
      case 409:
        return 'User already exists.';
      default:
        return fallback;
    }
  }
}
