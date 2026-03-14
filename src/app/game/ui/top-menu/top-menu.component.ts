import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TutorialOverlayComponent } from '../../../tutorial/tutorial-overlay.component';
import { TutorialService } from '../../../tutorial/tutorial.service';

@Component({
  selector: 'app-top-menu',
  imports: [RouterLink, RouterLinkActive, TutorialOverlayComponent],
  templateUrl: './top-menu.component.html'
})
export class TopMenuComponent {
  constructor(
    private readonly location: Location,
    private readonly router: Router,
    private readonly tutorialService: TutorialService
  ) {}

  public goBack(): void {
    this.location.back();
  }

  protected hasCurrentTutorial(): boolean {
    return this.tutorialService.hasTutorial(this.currentTutorialKey());
  }

  protected openCurrentTutorial(): void {
    const viewKey = this.currentTutorialKey();
    if (!viewKey) {
      return;
    }

    this.tutorialService.openTutorial(viewKey);
  }

  private currentTutorialKey() {
    return this.tutorialService.currentViewKeyFromUrl(this.router.url);
  }
}
