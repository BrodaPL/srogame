import { Component } from '@angular/core';
import { ProductionViewComponent } from '../production-view/production-view.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

@Component({
  selector: 'app-defence-view',
  imports: [TopMenuComponent, ProductionViewComponent],
  templateUrl: './defence-view.component.html'
})
export class DefenceViewComponent {}
