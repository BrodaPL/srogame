import { NgStyle } from '@angular/common';
import { Component, HostListener, computed, inject } from '@angular/core';
import { TutorialService } from './tutorial.service';

@Component({
  selector: 'app-tutorial-overlay',
  imports: [NgStyle],
  templateUrl: './tutorial-overlay.component.html',
  styleUrl: './tutorial-overlay.component.css'
})
export class TutorialOverlayComponent {
  private readonly tutorialService = inject(TutorialService);

  protected readonly state = this.tutorialService.state;
  protected readonly currentStep = computed(() => {
    const state = this.state();
    if (!state.entry) {
      return null;
    }

    return state.entry.steps[state.stepIndex] ?? null;
  });
  protected readonly currentCharacterImage = computed(() => {
    const step = this.currentStep();
    if (!step || step.characterImages.length === 0) {
      return '';
    }

    const index = this.state().characterImageIndex;
    return step.characterImages[Math.min(index, step.characterImages.length - 1)] ?? step.characterImages[0];
  });
  protected readonly shouldMirrorCharacter = computed(() => {
    const step = this.currentStep();
    if (!step) {
      return false;
    }

    if (step.targetId) {
      return this.state().resolvedCharacterSide === 'left';
    }

    return step.mirrorCharacter === true;
  });
  protected readonly isHighlightVisible = computed(() => {
    const stage = this.state().stage;
    return stage === 'highlight' || stage === 'bubble';
  });
  protected readonly isBubbleVisible = computed(() => this.state().stage === 'bubble');

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.tutorialService.refreshActiveStepLayout();
  }

  protected close(): void {
    this.tutorialService.closeTutorial();
  }

  protected previous(): void {
    this.tutorialService.previousStep();
  }

  protected next(): void {
    this.tutorialService.nextStep();
  }

  protected requestSkipAllTutorials(): void {
    this.tutorialService.openSkipAllConfirmation();
  }

  protected cancelSkipAllTutorials(): void {
    this.tutorialService.closeSkipAllConfirmation();
  }

  protected confirmSkipAllTutorials(): void {
    this.tutorialService.confirmSkipAllTutorials();
  }
}
