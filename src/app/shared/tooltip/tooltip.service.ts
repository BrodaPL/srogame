import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { Subscription } from 'rxjs';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

@Injectable({ providedIn: 'root' })
export class TooltipService implements OnDestroy {
  private tooltipElement: HTMLElement | null = null;
  private activeAnchor: HTMLElement | null = null;
  private readonly routeSubscription: Subscription;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly ngZone: NgZone,
    router: Router
  ) {
    this.routeSubscription = router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.hide();
      }
    });

    this.ngZone.runOutsideAngular(() => {
      this.document.addEventListener('click', this.handleDocumentClick, true);
      this.document.addEventListener('keydown', this.handleDocumentKeydown, true);
      this.document.defaultView?.addEventListener('resize', this.hide);
      this.document.defaultView?.addEventListener('scroll', this.hide, true);
    });
  }

  public show(text: string, anchor: HTMLElement, placement: TooltipPlacement = 'top'): void {
    const normalizedText = text.trim();
    if (!normalizedText) {
      this.hide();
      return;
    }

    const tooltip = this.ensureTooltipElement();
    this.activeAnchor = anchor;
    tooltip.textContent = normalizedText;
    tooltip.dataset['placement'] = placement;
    tooltip.classList.add('app-tooltip--visible');
    this.positionTooltip(anchor, tooltip, placement);
  }

  public hide = (): void => {
    if (!this.tooltipElement) {
      return;
    }

    this.tooltipElement.classList.remove('app-tooltip--visible');
    this.activeAnchor = null;
  };

  public ngOnDestroy(): void {
    this.routeSubscription.unsubscribe();
    this.document.removeEventListener('click', this.handleDocumentClick, true);
    this.document.removeEventListener('keydown', this.handleDocumentKeydown, true);
    this.document.defaultView?.removeEventListener('resize', this.hide);
    this.document.defaultView?.removeEventListener('scroll', this.hide, true);
    this.tooltipElement?.remove();
    this.tooltipElement = null;
    this.activeAnchor = null;
  }

  private ensureTooltipElement(): HTMLElement {
    if (this.tooltipElement) {
      return this.tooltipElement;
    }

    const tooltip = this.document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    this.document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;
    return tooltip;
  }

  private positionTooltip(anchor: HTMLElement, tooltip: HTMLElement, placement: TooltipPlacement): void {
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const viewportWidth = this.document.documentElement.clientWidth;
    const viewportHeight = this.document.documentElement.clientHeight;

    let left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);
    let top = anchorRect.top - tooltipRect.height - gap;

    if (placement === 'bottom') {
      top = anchorRect.bottom + gap;
    } else if (placement === 'left') {
      left = anchorRect.left - tooltipRect.width - gap;
      top = anchorRect.top + (anchorRect.height / 2) - (tooltipRect.height / 2);
    } else if (placement === 'right') {
      left = anchorRect.right + gap;
      top = anchorRect.top + (anchorRect.height / 2) - (tooltipRect.height / 2);
    }

    left = Math.min(Math.max(margin, left), Math.max(margin, viewportWidth - tooltipRect.width - margin));
    top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - tooltipRect.height - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.hide();
      return;
    }

    if (this.activeAnchor?.contains(target) || this.tooltipElement?.contains(target)) {
      return;
    }

    this.hide();
  };

  private readonly handleDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.hide();
    }
  };
}
