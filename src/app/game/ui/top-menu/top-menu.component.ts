import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-top-menu',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './top-menu.component.html'
})
export class TopMenuComponent {
  constructor(private readonly location: Location) {}

  public goBack(): void {
    this.location.back();
  }
}
