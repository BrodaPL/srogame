import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameStateService } from '../core/game-state.service';
import { resolveApiErrorMessage, resolveApiMessage } from '../i18n/api-message.utils';
import { I18nService } from '../i18n/i18n.service';
import type { RegisterConfigResponse } from '../models/game-api-types';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'dark' | 'light';
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink],
  templateUrl: './auth.component.html'
})
export class AuthComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('turnstileHost') private turnstileHost?: ElementRef<HTMLElement>;

  protected loginName = '';
  protected loginPassword = '';
  protected resendEmail = '';
  protected registerName = '';
  protected registerEmail = '';
  protected registerPassword = '';
  protected registerPasswordConfirm = '';
  protected registerConfig: RegisterConfigResponse | null = null;
  protected loginError: string | null = null;
  protected resendError: string | null = null;
  protected resendInfo: string | null = null;
  protected registerError: string | null = null;
  protected registerInfo: string | null = null;
  protected turnstileError: string | null = null;
  protected isLoggingIn = false;
  protected isResendingConfirmation = false;
  protected isRegistering = false;
  private turnstileToken: string | null = null;
  private turnstileWidgetId: string | null = null;
  private turnstileScriptPromise: Promise<TurnstileApi> | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameState: GameStateService,
    private readonly i18n: I18nService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    this.authApi.getRegisterConfig().subscribe({
      next: (config) => {
        this.registerConfig = config;
        this.turnstileError = config.registerUnavailableReason;
        void this.maybeRenderTurnstile();
        this.cdr.markForCheck();
      },
      error: () => {
        this.registerConfig = {
          registerEnabled: false,
          requiresTurnstile: false,
          turnstileSiteKey: null,
          registerUnavailableReason: 'Unable to load registration configuration.'
        };
        this.turnstileError = this.registerConfig.registerUnavailableReason;
        this.cdr.markForCheck();
      }
    });
  }

  public ngAfterViewInit(): void {
    void this.maybeRenderTurnstile();
  }

  public ngOnDestroy(): void {
    if (this.turnstileWidgetId && window.turnstile) {
      window.turnstile.remove(this.turnstileWidgetId);
    }
  }

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
        this.loginError = resolveApiErrorMessage(this.i18n, err, 'Login failed.');
        this.isLoggingIn = false;
        this.cdr.markForCheck();
      }
    });
  }

  protected register(): void {
    if (this.isRegistering) {
      return;
    }

    if (!this.registerConfig?.registerEnabled) {
      this.registerError = this.registerConfig?.registerUnavailableReason ?? 'Registration is unavailable right now.';
      return;
    }

    const playerName = this.registerName.trim();
    const email = this.registerEmail.trim();
    const password = this.registerPassword;
    const confirm = this.registerPasswordConfirm;
    if (!playerName || !email || !password) {
      this.registerError = 'Player name, email, and password are required.';
      return;
    }

    if (password !== confirm) {
      this.registerError = 'Passwords do not match.';
      return;
    }

    if (this.registerConfig.requiresTurnstile && !this.turnstileToken) {
      this.registerError = 'Please complete the CAPTCHA challenge.';
      return;
    }

    this.isRegistering = true;
    this.registerError = null;
    this.registerInfo = null;

    this.authApi.register({ playerName, email, password, turnstileToken: this.turnstileToken }).subscribe({
      next: (response) => {
        this.gameState.clearGalaxy();
        this.registerName = '';
        this.registerEmail = '';
        this.registerPassword = '';
        this.registerPasswordConfirm = '';
        this.turnstileToken = null;
        this.registerInfo = resolveApiMessage(this.i18n, response, response.message);
        this.isRegistering = false;
        this.resetTurnstileWidget();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.registerError = resolveApiErrorMessage(this.i18n, err, 'Registration failed.');
        this.isRegistering = false;
        this.turnstileToken = null;
        this.resetTurnstileWidget();
        this.cdr.markForCheck();
      }
    });
  }

  protected resendConfirmation(): void {
    if (this.isResendingConfirmation) {
      return;
    }

    const email = this.resendEmail.trim();
    if (!email) {
      this.resendError = 'Email is required.';
      return;
    }

    this.isResendingConfirmation = true;
    this.resendError = null;
    this.resendInfo = null;
    this.authApi.resendConfirmation({ email }).subscribe({
      next: (response) => {
        this.resendInfo = resolveApiMessage(this.i18n, response, response.message);
        this.isResendingConfirmation = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.resendError = resolveApiErrorMessage(this.i18n, err, 'Unable to resend confirmation.');
        this.isResendingConfirmation = false;
        this.cdr.markForCheck();
      }
    });
  }

  protected canRegister(): boolean {
    if (this.isRegistering) {
      return false;
    }

    if (!this.registerConfig?.registerEnabled) {
      return false;
    }

    return !this.registerConfig.requiresTurnstile || !!this.turnstileToken;
  }

  private async maybeRenderTurnstile(): Promise<void> {
    if (!this.turnstileHost?.nativeElement || !this.registerConfig?.requiresTurnstile || !this.registerConfig.turnstileSiteKey) {
      return;
    }

    if (this.turnstileWidgetId) {
      return;
    }

    try {
      const turnstile = await this.loadTurnstileScript();
      this.turnstileWidgetId = turnstile.render(this.turnstileHost.nativeElement, {
        sitekey: this.registerConfig.turnstileSiteKey,
        theme: 'dark',
        callback: (token: string) => {
          this.turnstileToken = token;
          this.turnstileError = null;
          this.cdr.markForCheck();
        },
        'expired-callback': () => {
          this.turnstileToken = null;
          this.cdr.markForCheck();
        },
        'error-callback': () => {
          this.turnstileToken = null;
          this.turnstileError = 'CAPTCHA failed to load. Refresh the page and try again.';
          this.cdr.markForCheck();
        }
      });
    } catch {
      this.turnstileError = 'CAPTCHA failed to load. Refresh the page and try again.';
      this.cdr.markForCheck();
    }
  }

  private loadTurnstileScript(): Promise<TurnstileApi> {
    if (window.turnstile) {
      return Promise.resolve(window.turnstile);
    }

    if (this.turnstileScriptPromise) {
      return this.turnstileScriptPromise;
    }

    this.turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
      if (existing) {
        existing.addEventListener('load', () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable')));
        existing.addEventListener('error', () => reject(new Error('Turnstile script failed')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset['turnstileScript'] = 'true';
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable'));
      script.onerror = () => reject(new Error('Turnstile script failed'));
      document.head.appendChild(script);
    });

    return this.turnstileScriptPromise;
  }

  private resetTurnstileWidget(): void {
    if (this.turnstileWidgetId && window.turnstile) {
      window.turnstile.reset(this.turnstileWidgetId);
    }
  }
}
