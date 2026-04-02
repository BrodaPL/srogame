import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { TUTORIAL_CONTENT } from './tutorial-content';
import {
  TutorialCharacterSide,
  TutorialEntry,
  TutorialStep,
  TutorialViewKey,
  createTutorialReadState
} from './tutorial-types';

type TutorialStage = 'focus' | 'highlight' | 'bubble';

type TutorialTargetRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type TutorialLayout = {
  dockStyle: Record<string, string>;
  bubbleStyle: Record<string, string>;
  resolvedBubblePosition: 'top' | 'bottom';
  resolvedCharacterSide: TutorialCharacterSide;
};

type TutorialStepPresentation = {
  targetRect: TutorialTargetRect | null;
  targetPadding: number;
  dockStyle: Record<string, string>;
  bubbleStyle: Record<string, string>;
  resolvedBubblePosition: 'top' | 'bottom';
  resolvedCharacterSide: TutorialCharacterSide;
  characterImageIndex: number;
};

type TutorialOverlayState = {
  entry: TutorialEntry | null;
  stepIndex: number;
  isOpen: boolean;
  isSkipAllConfirmOpen: boolean;
  isSaving: boolean;
  stage: TutorialStage;
  targetRect: TutorialTargetRect | null;
  targetPadding: number;
  dockStyle: Record<string, string>;
  bubbleStyle: Record<string, string>;
  resolvedBubblePosition: 'top' | 'bottom';
  resolvedCharacterSide: TutorialCharacterSide;
  characterImageIndex: number;
};

type TutorialStepPreparer = (step: TutorialStep, stepIndex: number) => void;

@Injectable({
  providedIn: 'root'
})
export class TutorialService {
  private static readonly FOCUS_STAGE_DURATION_MS = 150;
  private static readonly HIGHLIGHT_STAGE_DURATION_MS = 150;
  private static readonly TARGET_GAP_PX = 18;
  private static readonly VIEWPORT_MARGIN_PX = 16;
  private static readonly DESKTOP_BUBBLE_MAX_WIDTH_PX = 580;
  private static readonly DESKTOP_BUBBLE_MIN_WIDTH_PX = 340;
  private static readonly DESKTOP_BUBBLE_MIN_HEIGHT_PX = 320;
  private static readonly DESKTOP_BUBBLE_MAX_HEIGHT_PX = 640;
  private static readonly DESKTOP_CHARACTER_WIDTH_PX = 260;
  private static readonly DESKTOP_CHARACTER_HEIGHT_PX = 380;
  private static readonly DOCK_BUBBLE_CHARACTER_OVERLAP_PX = 18;
  private static readonly SCROLL_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'PageUp',
    'PageDown',
    'Home',
    'End',
    ' '
  ]);

  private readonly document = inject(DOCUMENT);
  private readonly stepPreparers = new Map<TutorialViewKey, TutorialStepPreparer>();
  private readonly stateSignal = signal<TutorialOverlayState>({
    entry: null,
    stepIndex: 0,
    isOpen: false,
    isSkipAllConfirmOpen: false,
    isSaving: false,
    stage: 'bubble',
    targetRect: null,
    targetPadding: 12,
    dockStyle: {},
    bubbleStyle: {},
    resolvedBubblePosition: 'bottom',
    resolvedCharacterSide: 'right',
    characterImageIndex: 0
  });
  private readonly stepTimers: number[] = [];
  private previousHtmlOverflow = '';
  private previousBodyOverflow = '';
  private previousBodyTouchAction = '';
  private readonly wheelBlocker = (event: Event) => {
    if (!this.stateSignal().isOpen) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest('.tutorial-overlay__bubble')) {
      return;
    }

    event.preventDefault();
  };
  private readonly keydownBlocker = (event: KeyboardEvent) => {
    if (!this.stateSignal().isOpen) {
      return;
    }

    if (
      !TutorialService.SCROLL_KEYS.has(event.key)
      || event.altKey
      || event.ctrlKey
      || event.metaKey
    ) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest('.tutorial-overlay__bubble')) {
      return;
    }

    event.preventDefault();
  };

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
      isSaving: false,
      stage: 'bubble',
      targetRect: null,
      targetPadding: 12,
      dockStyle: {},
      bubbleStyle: {},
      resolvedBubblePosition: 'bottom',
      resolvedCharacterSide: 'right',
      characterImageIndex: 0
    });
    this.applyScrollLock();
    this.beginCurrentStepSequence();
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
    if (!current.entry || current.isSaving || current.stepIndex === 0) {
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      stepIndex: state.stepIndex - 1,
      isSkipAllConfirmOpen: false
    }));
    this.beginCurrentStepSequence();
  }

  public nextStep(): void {
    const current = this.stateSignal();
    if (!current.entry || current.isSaving) {
      return;
    }

    if (current.stage !== 'bubble') {
      this.finishCurrentStepSequence();
      return;
    }

    if (current.stepIndex >= current.entry.steps.length - 1) {
      this.markCurrentTutorialAsReadAndClose();
      return;
    }

    this.stateSignal.update((state) => ({
      ...state,
      stepIndex: state.stepIndex + 1,
      isSkipAllConfirmOpen: false
    }));
    this.beginCurrentStepSequence();
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
    this.clearStepTimers();
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

  public refreshActiveStepLayout(): void {
    const current = this.stateSignal();
    if (!current.isOpen || !current.entry) {
      return;
    }

    const step = current.entry.steps[current.stepIndex];
    const presentation = this.buildStepPresentation(step, current.stepIndex);
    this.stateSignal.update((state) => ({
      ...state,
      targetRect: presentation.targetRect,
      targetPadding: presentation.targetPadding,
      dockStyle: presentation.dockStyle,
      bubbleStyle: presentation.bubbleStyle,
      resolvedBubblePosition: presentation.resolvedBubblePosition,
      resolvedCharacterSide: presentation.resolvedCharacterSide,
      characterImageIndex: presentation.characterImageIndex
    }));
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

    if (url.startsWith('/game/mail')) {
      return 'mailView';
    }

    if (url.startsWith('/game/diplomacy')) {
      return 'diplomacyView';
    }

    return null;
  }

  public registerStepPreparer(
    viewKey: TutorialViewKey,
    preparer: TutorialStepPreparer
  ): () => void {
    this.stepPreparers.set(viewKey, preparer);

    return () => {
      if (this.stepPreparers.get(viewKey) === preparer) {
        this.stepPreparers.delete(viewKey);
      }
    };
  }

  private beginCurrentStepSequence(): void {
    this.clearStepTimers();

    const current = this.stateSignal();
    if (!current.entry) {
      return;
    }

    const step = current.entry.steps[current.stepIndex];
    if (!step) {
      return;
    }

    this.stepPreparers.get(current.entry.key)?.(step, current.stepIndex);

    const element = this.findTargetElement(step.targetId);
    if (element) {
      element.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'center'
      });
    }

    const presentation = this.buildStepPresentation(step, current.stepIndex);
    const shouldStage = !!step.targetId && !!presentation.targetRect && !this.prefersReducedMotion();
    this.stateSignal.update((state) => ({
      ...state,
      isSkipAllConfirmOpen: false,
      stage: shouldStage ? 'focus' : 'bubble',
      targetRect: presentation.targetRect,
      targetPadding: presentation.targetPadding,
      dockStyle: presentation.dockStyle,
      bubbleStyle: presentation.bubbleStyle,
      resolvedBubblePosition: presentation.resolvedBubblePosition,
      resolvedCharacterSide: presentation.resolvedCharacterSide,
      characterImageIndex: presentation.characterImageIndex
    }));

    if (!shouldStage) {
      return;
    }

    this.stepTimers.push(window.setTimeout(() => {
      this.refreshActiveStepLayout();
      this.stateSignal.update((state) => ({
        ...state,
        stage: 'highlight'
      }));
    }, TutorialService.FOCUS_STAGE_DURATION_MS));

    this.stepTimers.push(window.setTimeout(() => {
      this.refreshActiveStepLayout();
      this.stateSignal.update((state) => ({
        ...state,
        stage: 'bubble'
      }));
    }, TutorialService.FOCUS_STAGE_DURATION_MS + TutorialService.HIGHLIGHT_STAGE_DURATION_MS));
  }

  private finishCurrentStepSequence(): void {
    this.clearStepTimers();
    this.refreshActiveStepLayout();
    this.stateSignal.update((state) => ({
      ...state,
      stage: 'bubble'
    }));
  }

  private buildStepPresentation(step: TutorialStep, stepIndex: number): TutorialStepPresentation {
    const targetPadding = Math.max(0, step.targetPadding ?? 12);
    const targetRect = this.measureTargetRect(this.findTargetElement(step.targetId), targetPadding);
    const layout = this.buildLayout(step, targetRect);
    const previousSide = this.resolvePreviousStepCharacterSide(stepIndex);
    const characterImageIndex = step.characterImages.length > 1 && previousSide === layout.resolvedCharacterSide
      ? 1
      : 0;

    return {
      targetRect,
      targetPadding,
      dockStyle: layout.dockStyle,
      bubbleStyle: layout.bubbleStyle,
      resolvedBubblePosition: layout.resolvedBubblePosition,
      resolvedCharacterSide: layout.resolvedCharacterSide,
      characterImageIndex: Math.min(characterImageIndex, Math.max(0, step.characterImages.length - 1))
    };
  }

  private resolvePreviousStepCharacterSide(stepIndex: number): TutorialCharacterSide | null {
    const current = this.stateSignal();
    const entry = current.entry;
    if (!entry || stepIndex <= 0) {
      return null;
    }

    const previousStep = entry.steps[stepIndex - 1];
    if (!previousStep) {
      return null;
    }

    const targetRect = this.measureTargetRect(
      this.findTargetElement(previousStep.targetId),
      Math.max(0, previousStep.targetPadding ?? 12)
    );

    return this.buildLayout(previousStep, targetRect).resolvedCharacterSide;
  }

  private buildLayout(step: TutorialStep, targetRect: TutorialTargetRect | null): TutorialLayout {
    const viewportWidth = this.window()?.innerWidth ?? 1280;
    const viewportHeight = this.window()?.innerHeight ?? 720;
    const isCompactViewport = viewportWidth < 720;
    const bubbleWidth = isCompactViewport
      ? Math.max(220, viewportWidth - (TutorialService.VIEWPORT_MARGIN_PX * 2))
      : Math.min(
        TutorialService.DESKTOP_BUBBLE_MAX_WIDTH_PX,
        Math.max(
          TutorialService.DESKTOP_BUBBLE_MIN_WIDTH_PX,
          viewportWidth - (TutorialService.VIEWPORT_MARGIN_PX * 4) - TutorialService.DESKTOP_CHARACTER_WIDTH_PX
        )
      );
    const characterWidth = isCompactViewport ? 180 : TutorialService.DESKTOP_CHARACTER_WIDTH_PX;
    const characterHeight = isCompactViewport ? 250 : TutorialService.DESKTOP_CHARACTER_HEIGHT_PX;

    if (!targetRect) {
      return this.buildFallbackLayout(
        step,
        bubbleWidth,
        characterWidth,
        characterHeight
      );
    }

    if (isCompactViewport) {
      return this.buildCompactTargetLayout(
        step,
        targetRect,
        viewportWidth,
        viewportHeight,
        bubbleWidth,
        characterWidth,
        characterHeight
      );
    }

    return this.buildDesktopTargetLayout(
      targetRect,
      viewportWidth,
      viewportHeight,
      bubbleWidth,
      characterWidth,
      characterHeight
    );
  }

  private buildFallbackLayout(
    step: TutorialStep,
    bubbleWidth: number,
    characterWidth: number,
    characterHeight: number
  ): TutorialLayout {
    const dockStyle: Record<string, string> = {
      left: '24px',
      bottom: '16px',
      '--tutorial-character-width': `${characterWidth}px`,
      '--tutorial-character-height': `${characterHeight}px`
    };
    const bubbleStyle: Record<string, string> = {
      width: `${bubbleWidth}px`,
      '--tutorial-bubble-min-height': `${TutorialService.DESKTOP_BUBBLE_MIN_HEIGHT_PX}px`,
      '--tutorial-bubble-max-height': `${Math.min(
        TutorialService.DESKTOP_BUBBLE_MAX_HEIGHT_PX,
        Math.max(TutorialService.DESKTOP_BUBBLE_MIN_HEIGHT_PX, characterHeight + 80)
      )}px`,
      '--tutorial-bubble-character-overlap': `${TutorialService.DOCK_BUBBLE_CHARACTER_OVERLAP_PX}px`
    };

    if (step.characterSide === 'right') {
      dockStyle['right'] = '24px';
      delete dockStyle['left'];
    }

    return {
      dockStyle,
      bubbleStyle,
      resolvedBubblePosition: step.bubblePosition,
      resolvedCharacterSide: step.characterSide
    };
  }

  private buildCompactTargetLayout(
    step: TutorialStep,
    targetRect: TutorialTargetRect,
    viewportWidth: number,
    viewportHeight: number,
    bubbleWidth: number,
    characterWidth: number,
    characterHeight: number
  ): TutorialLayout {
    const dockStyle: Record<string, string> = {
      left: `${TutorialService.VIEWPORT_MARGIN_PX}px`,
      bottom: `${TutorialService.VIEWPORT_MARGIN_PX}px`,
      '--tutorial-character-width': `${characterWidth}px`,
      '--tutorial-character-height': `${characterHeight}px`
    };
    const bubbleStyle: Record<string, string> = {
      width: `${bubbleWidth}px`,
      '--tutorial-bubble-min-height': '260px',
      '--tutorial-bubble-max-height': `${Math.max(260, viewportHeight * 0.46)}px`,
      '--tutorial-bubble-character-overlap': '14px'
    };
    const preferredSide: TutorialCharacterSide = targetRect.centerX > viewportWidth * 0.62
      ? 'left'
      : 'right';

    return {
      dockStyle,
      bubbleStyle,
      resolvedBubblePosition: 'bottom',
      resolvedCharacterSide: preferredSide
    };
  }

  private buildDesktopTargetLayout(
    targetRect: TutorialTargetRect,
    viewportWidth: number,
    viewportHeight: number,
    bubbleWidth: number,
    characterWidth: number,
    characterHeight: number
  ): TutorialLayout {
    const preferredBubblePosition: 'top' | 'bottom' = targetRect.centerY > viewportHeight * 0.62
      ? 'top'
      : 'bottom';
    const preferredCharacterSide: TutorialCharacterSide = targetRect.centerX > viewportWidth * 0.62
      ? 'left'
      : 'right';
    const availableAbove = targetRect.top - TutorialService.VIEWPORT_MARGIN_PX;
    const availableBelow = viewportHeight - targetRect.bottom - TutorialService.VIEWPORT_MARGIN_PX;
    let bubblePosition = preferredBubblePosition;

    if (bubblePosition === 'bottom' && availableBelow < 180 && availableAbove > availableBelow) {
      bubblePosition = 'top';
    } else if (bubblePosition === 'top' && availableAbove < 180 && availableBelow > availableAbove) {
      bubblePosition = 'bottom';
    }

    const availableLeft = targetRect.left - TutorialService.VIEWPORT_MARGIN_PX;
    const availableRight = viewportWidth - targetRect.right - TutorialService.VIEWPORT_MARGIN_PX;
    let characterSide: TutorialCharacterSide = preferredCharacterSide;
    if (characterSide === 'right' && availableRight < characterWidth && availableLeft > availableRight) {
      characterSide = 'left';
    } else if (characterSide === 'left' && availableLeft < characterWidth && availableRight > availableLeft) {
      characterSide = 'right';
    }

    const bubbleMinHeight = TutorialService.DESKTOP_BUBBLE_MIN_HEIGHT_PX;
    const bubbleMaxHeight = Math.min(
      TutorialService.DESKTOP_BUBBLE_MAX_HEIGHT_PX,
      Math.max(
        bubbleMinHeight,
        viewportHeight
        - (TutorialService.VIEWPORT_MARGIN_PX * 2)
        - characterHeight
        + TutorialService.DOCK_BUBBLE_CHARACTER_OVERLAP_PX
      )
    );
    const dockWidth = Math.max(bubbleWidth, characterWidth);
    const dockHeight = characterHeight
      + bubbleMaxHeight
      - TutorialService.DOCK_BUBBLE_CHARACTER_OVERLAP_PX;
    const dockLeftUnclamped = characterSide === 'right'
      ? targetRect.right + TutorialService.TARGET_GAP_PX
      : targetRect.left - dockWidth - TutorialService.TARGET_GAP_PX;
    const dockLeft = this.clamp(
      dockLeftUnclamped,
      TutorialService.VIEWPORT_MARGIN_PX,
      viewportWidth - dockWidth - TutorialService.VIEWPORT_MARGIN_PX
    );
    const preferredCharacterTop = this.clamp(
      targetRect.centerY - (characterHeight / 2),
      TutorialService.VIEWPORT_MARGIN_PX,
      viewportHeight - characterHeight - TutorialService.VIEWPORT_MARGIN_PX
    );
    const dockTopUnclamped = bubblePosition === 'top'
      ? preferredCharacterTop - (bubbleMaxHeight - TutorialService.DOCK_BUBBLE_CHARACTER_OVERLAP_PX)
      : preferredCharacterTop;
    const dockStyle: Record<string, string> = {
      left: `${dockLeft}px`,
      top: `${this.clamp(
        dockTopUnclamped,
        TutorialService.VIEWPORT_MARGIN_PX,
        viewportHeight - dockHeight - TutorialService.VIEWPORT_MARGIN_PX
      )}px`,
      '--tutorial-character-width': `${characterWidth}px`,
      '--tutorial-character-height': `${characterHeight}px`
    };
    const bubbleStyle: Record<string, string> = {
      width: `${bubbleWidth}px`,
      '--tutorial-bubble-min-height': `${bubbleMinHeight}px`,
      '--tutorial-bubble-max-height': `${bubbleMaxHeight}px`,
      '--tutorial-bubble-character-overlap': `${TutorialService.DOCK_BUBBLE_CHARACTER_OVERLAP_PX}px`
    };

    return {
      dockStyle,
      bubbleStyle,
      resolvedBubblePosition: bubblePosition,
      resolvedCharacterSide: characterSide
    };
  }

  private findTargetElement(targetId: string | undefined): HTMLElement | null {
    if (!targetId) {
      return null;
    }

    return this.document.querySelector<HTMLElement>(
      `[data-tutorial-id="${this.escapeAttributeValue(targetId)}"]`
    );
  }

  private measureTargetRect(
    element: HTMLElement | null,
    padding: number
  ): TutorialTargetRect | null {
    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const view = this.window();
    const viewportWidth = view?.innerWidth ?? 0;
    const viewportHeight = view?.innerHeight ?? 0;
    const left = this.clamp(rect.left - padding, 0, viewportWidth);
    const top = this.clamp(rect.top - padding, 0, viewportHeight);
    const right = this.clamp(rect.right + padding, 0, viewportWidth);
    const bottom = this.clamp(rect.bottom + padding, 0, viewportHeight);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    return {
      top,
      right,
      bottom,
      left,
      width,
      height,
      centerX: left + (width / 2),
      centerY: top + (height / 2)
    };
  }

  private escapeAttributeValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private prefersReducedMotion(): boolean {
    return !!this.window()?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  private window(): Window | null {
    return this.document.defaultView;
  }

  private clamp(value: number, min: number, max: number): number {
    if (max < min) {
      return min;
    }

    return Math.min(Math.max(value, min), max);
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
    this.clearStepTimers();
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

  private clearStepTimers(): void {
    while (this.stepTimers.length > 0) {
      window.clearTimeout(this.stepTimers.pop());
    }
  }

  private resetOverlay(): void {
    this.clearStepTimers();
    this.releaseScrollLock();
    this.stateSignal.set({
      entry: null,
      stepIndex: 0,
      isOpen: false,
      isSkipAllConfirmOpen: false,
      isSaving: false,
      stage: 'bubble',
      targetRect: null,
      targetPadding: 12,
      dockStyle: {},
      bubbleStyle: {},
      resolvedBubblePosition: 'bottom',
      resolvedCharacterSide: 'right',
      characterImageIndex: 0
    });
  }

  private applyScrollLock(): void {
    const html = this.document.documentElement;
    const body = this.document.body;
    if (!html || !body) {
      return;
    }

    this.previousHtmlOverflow = html.style.overflow;
    this.previousBodyOverflow = body.style.overflow;
    this.previousBodyTouchAction = body.style.touchAction;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    this.document.addEventListener('wheel', this.wheelBlocker, { passive: false, capture: true });
    this.document.addEventListener('touchmove', this.wheelBlocker, { passive: false, capture: true });
    this.document.addEventListener('keydown', this.keydownBlocker, true);
  }

  private releaseScrollLock(): void {
    const html = this.document.documentElement;
    const body = this.document.body;
    if (html) {
      html.style.overflow = this.previousHtmlOverflow;
    }
    if (body) {
      body.style.overflow = this.previousBodyOverflow;
      body.style.touchAction = this.previousBodyTouchAction;
    }

    this.document.removeEventListener('wheel', this.wheelBlocker, true);
    this.document.removeEventListener('touchmove', this.wheelBlocker, true);
    this.document.removeEventListener('keydown', this.keydownBlocker, true);
  }
}
