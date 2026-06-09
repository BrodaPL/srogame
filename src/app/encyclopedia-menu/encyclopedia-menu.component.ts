import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nPipe } from '../i18n/i18n.pipe';

@Component({
  selector: 'app-encyclopedia-menu',
  imports: [RouterLink, I18nPipe],
  templateUrl: './encyclopedia-menu.component.html'
})
export class EncyclopediaMenuComponent {
}
