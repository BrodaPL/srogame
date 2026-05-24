import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { TooltipPlacement, TooltipService } from './tooltip.service';

@Directive({
  selector: '[appTooltip]',
  standalone: true
})
export class TooltipDirective {
  @Input('appTooltip') public tooltipText = '';
  @Input() public tooltipPlacement: TooltipPlacement = 'top';

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly tooltipService: TooltipService
  ) {}

  @HostListener('mouseenter')
  @HostListener('focusin')
  public showTooltip(): void {
    this.tooltipService.show(this.tooltipText, this.elementRef.nativeElement, this.tooltipPlacement);
  }

  @HostListener('click')
  public showTooltipOnClick(): void {
    this.showTooltip();
  }

  @HostListener('mouseleave')
  @HostListener('blur')
  public hideTooltip(): void {
    this.tooltipService.hide();
  }
}
