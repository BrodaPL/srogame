import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-encyclopedia-image-dialog',
  templateUrl: './encyclopedia-image-dialog.component.html',
  styleUrl: './encyclopedia-image-dialog.component.css'
})
export class EncyclopediaImageDialogComponent implements OnChanges {
  @Input() public isOpen = false;
  @Input() public title = '';
  @Input() public previewImagePath = '';
  @Input() public rawImagePath = '';

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
    if (!this.isOpen) {
      this.displayedImagePath = '';
      this.isRawLoading = false;
      this.rawLoadFailed = false;
      this.loadToken += 1;
      return;
    }

    this.displayedImagePath = this.previewImagePath;
    this.rawLoadFailed = false;

    if (this.rawImagePath.length === 0 || this.rawImagePath === this.previewImagePath) {
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
        this.displayedImagePath = this.rawImagePath;
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

    rawImage.src = this.rawImagePath;
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
