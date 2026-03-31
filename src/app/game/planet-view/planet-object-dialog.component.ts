import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, Output, SimpleChanges } from '@angular/core';

export type PlanetObjectDetailTone = 'default' | 'good' | 'warn' | 'bad' | 'muted';

export interface PlanetObjectDetailRow {
  label: string;
  value: string;
  tone?: PlanetObjectDetailTone;
}

export interface PlanetObjectDetailSection {
  title: string;
  rows: PlanetObjectDetailRow[];
}

export interface PlanetObjectDetailDialogData {
  kindLabel: string;
  title: string;
  subtitle: string;
  description: string;
  previewImagePath: string;
  rawImagePath: string;
  sections: PlanetObjectDetailSection[];
}

@Component({
  selector: 'app-planet-object-dialog',
  templateUrl: './planet-object-dialog.component.html',
  styleUrl: './planet-object-dialog.component.css'
})
export class PlanetObjectDialogComponent implements OnChanges {
  @Input() public isOpen = false;
  @Input() public details: PlanetObjectDetailDialogData | null = null;

  @Output() public readonly closed = new EventEmitter<void>();

  protected displayedImagePath = '';
  protected isRawLoading = false;
  protected rawLoadFailed = false;

  private loadToken = 0;

  constructor(
    private readonly ngZone: NgZone,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {}

  public ngOnChanges(_changes: SimpleChanges): void {
    if (!this.isOpen || !this.details) {
      this.displayedImagePath = '';
      this.isRawLoading = false;
      this.rawLoadFailed = false;
      this.loadToken += 1;
      return;
    }

    this.displayedImagePath = this.details.previewImagePath;
    this.rawLoadFailed = false;

    if (this.details.rawImagePath.length === 0 || this.details.rawImagePath === this.details.previewImagePath) {
      this.isRawLoading = false;
      return;
    }

    this.isRawLoading = true;

    const token = ++this.loadToken;
    const rawImage = new Image();

    rawImage.onload = () => {
      if (token !== this.loadToken) {
        return;
      }

      this.ngZone.run(() => {
        this.displayedImagePath = this.details?.rawImagePath ?? this.details?.previewImagePath ?? '';
        this.isRawLoading = false;
        this.changeDetectorRef.detectChanges();
      });
    };

    rawImage.onerror = () => {
      if (token !== this.loadToken) {
        return;
      }

      this.ngZone.run(() => {
        this.rawLoadFailed = true;
        this.isRawLoading = false;
        this.changeDetectorRef.detectChanges();
      });
    };

    rawImage.src = this.details.rawImagePath;
  }

  @HostListener('window:keydown.escape')
  protected onEscapeKey(): void {
    if (!this.isOpen) {
      return;
    }

    this.close();
  }

  protected close(): void {
    this.closed.emit();
  }
}
