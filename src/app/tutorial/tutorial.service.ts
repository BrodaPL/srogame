import { Injectable, signal } from '@angular/core';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { TUTORIAL_CONTENT } from './tutorial-content';
import { TutorialEntry, TutorialViewKey, createTutorialReadState } from './tutorial-types';

type TutorialOverlayState = {
  entry: TutorialEntry | null;
  stepIndex: number;
  isOpen: boolean;
  isSkipAllConfirmOpen: boolean;
  isSaving: boolean;
};

@Injectable({
  providedIn: 'root'
})
export class TutorialService {
  private readonly stateSignal = signal<TutorialOverlayState>({
    entry: null,
    stepIndex: 0,
    isOpen: false,
    isSkipAllConfirmOpen: false,
    isSaving: false
  });

  public readonly state = this.stateSignal.asReadonly();

  constructor(
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService
  ) {}

  public hasTutorial(viewKey: TutorialViewKey | null): boolean {
    return !!viewKey && !!TUTORIAL_CONTENT[viewKey];
  }

  public openTutorial(viewKey: TutorialViewKey): void {
    const entry = TUTORIAL_CONTENT[viewKey];
    if (!entry) {
      return;
    }

    this.stateSignal.set({
      entry,
      stepIndex: 0,
      isOpen: true,
      isSkipAllConfirmOpen: false,
      isSaving: false
    });
  }

  public autoOpenTutorial(viewKey: TutorialViewKey): void {
    if (!this.hasTutorial(viewKey)) {
      return;
    }

    const session = this.authState.session();
    const tutorialRead = session?.tutorialRead ?? createTutorialReadState(false);
    if (tutorialRead[viewKey]) {
      return;
    }

    const current = this.stateSignal();
    if (current.isOpen && current.entry?.key === viewKey) {
      return;
    }

    this.openTutorial(viewKey);
  }

  public previousStep(): void {
    const current = this.stateSignal();
    if (!current.entry || current.isSaving) {
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      stepIndex: Math.max(0, state.stepIndex - 1)
    }));
  }

  public nextStep(): void {
    const current = this.stateSignal();
    if (!current.entry || current.isSaving) {
      return;
    }

    if (current.stepIndex >= current.entry.steps.length - 1) {
      this.markCurrentTutorialAsReadAndClose();
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      stepIndex: state.stepIndex + 1
    }));
  }

  public closeTutorial(): void {
    const current = this.stateSignal();
    if (!current.entry || current.isSaving) {
      return;
    }

    this.markCurrentTutorialAsReadAndClose();
  }

  public openSkipAllConfirmation(): void {
    if (!this.stateSignal().entry || this.stateSignal().isSaving) {
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      isSkipAllConfirmOpen: true
    }));
  }

  public closeSkipAllConfirmation(): void {
    this.stateSignal.update((state) => ({
      ...state,
      isSkipAllConfirmOpen: false
    }));
  }

  public confirmSkipAllTutorials(): void {
    const session = this.authState.session();
    if (!session || this.stateSignal().isSaving) {
      return;
    }

    const previousSession = session;
    this.stateSignal.update((state) => ({
      ...state,
      isSaving: true
    }));

    this.authState.setSession({
      ...session,
      tutorialRead: createTutorialReadState(true)
    });

    this.gameApi.markTutorialRead({ markAllRead: true }, session.token).subscribe({
      next: (updatedSession) => {
        this.authState.setSession(updatedSession);
        this.resetOverlay();
      },
      error: () => {
        this.authState.setSession(previousSession);
        this.resetOverlay();
      }
    });
  }

  public currentViewKeyFromUrl(url: string): TutorialViewKey | null {
    if (url.startsWith('/game/planet')) {
      return 'planetView';
    }

    if (url.startsWith('/game/galactic')) {
      return 'galacticView';
    }

    if (url.startsWith('/game/imperium')) {
      return 'imperiumView';
    }

    if (url.startsWith('/game/buildings')) {
      return 'buildingsView';
    }

    if (url.startsWith('/game/production')) {
      return 'productionView';
    }

    if (url.startsWith('/game/researches')) {
      return 'researchesView';
    }

    if (url.startsWith('/game/mission-planner')) {
      return 'missionPlannerView';
    }

    if (url.startsWith('/game/operations')) {
      return 'operationsView';
    }

    if (url.startsWith('/game/reports')) {
      return 'reportsView';
    }

    return null;
  }

  private markCurrentTutorialAsReadAndClose(): void {
    const current = this.stateSignal();
    const session = this.authState.session();
    if (!current.entry || !session) {
      this.resetOverlay();
      return;
    }
    const viewKey = current.entry.key;

    const previousSession = session;
    this.stateSignal.update((state) => ({
      ...state,
      isSaving: true
    }));

    this.authState.setSession({
      ...session,
      tutorialRead: {
        ...(session.tutorialRead ?? createTutorialReadState(false)),
        [viewKey]: true
      }
    });

    this.gameApi.markTutorialRead({ viewKey }, session.token).subscribe({
      next: (updatedSession) => {
        this.authState.setSession(updatedSession);
        this.resetOverlay();
      },
      error: () => {
        this.authState.setSession(previousSession);
        this.resetOverlay();
      }
    });
  }

  private resetOverlay(): void {
    this.stateSignal.set({
      entry: null,
      stepIndex: 0,
      isOpen: false,
      isSkipAllConfirmOpen: false,
      isSaving: false
    });
  }
}
