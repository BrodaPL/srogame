import { Component, computed, inject } from '@angular/core';
import { TutorialService } from './tutorial.service';

@Component({
  selector: 'app-tutorial-overlay',
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
