import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nPipe } from '../i18n/i18n.pipe';

@Component({
  selector: 'app-help-about',
  imports: [RouterLink, I18nPipe],
  templateUrl: './help-about.component.html'
})
export class HelpAboutComponent {
}
