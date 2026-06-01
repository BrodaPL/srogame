import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import type {
  GalaxyFleetRouteKind,
  GalaxyByteCellDto,
  GalaxyOwnFleetMovementDto,
  GalaxyPresentationDataDto,
  OwnershipByteCellDto,
  StarSystemNoteDto,
  ClientStarSystemDto,
  ClientPlanetDto,
  GalaxySetup,
  SensorPhalanxCapabilitiesDto,
  SensorPhalanxFleetContactDto,
  SensorPhalanxScanResponse,
  ClientCoordinates
} from '../../models/game-api-types';
import { finalize } from 'rxjs';
import { GameStateService } from '../../core/game-state.service';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { NoteBorderColor } from '../../models/enums/note-border-color';
import { PlanetType } from '../../models/enums/planet-type';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { SpySolarSystemDialogComponent } from '../ui/spy-solar-system-dialog/spy-solar-system-dialog.component';
import { BuildingType } from '../../models/enums/building-type';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import {
  calculateSensorPhalanxActiveScanRange,
  calculateSensorPhalanxNormalRange
} from '../../models/sensor-phalanx/sensor-phalanx';

type CellFillKind =
  | 'void'
  | 'center'
  | 'noData'
  | 'neutralOnly'
  | 'playerOnly'
  | 'botOrNeutral'
  | 'humanOrNeutral'
  | 'humanBotAnyNeutral'
  | 'playerAndEnemyAnyNeutral';

type GalacticCellVm = {
  x: number;
  y: number;
  isVoid: boolean;
  isCenter: boolean;
  planetsCount: number;
  asteroidsCount: number;
  fillKind: CellFillKind;
  valueLabel: string;
  ownedPlanetsDotsLabel: string;
  hasOwnFleetPresence: boolean;
  isSensorScannable: boolean;
  noteBorderColor: string | null;
  coordsLabel: string;
  tooltip: string;
};

type GalacticRouteVm = {
  key: string;
  routeKind: GalaxyFleetRouteKind;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  badgeX: number;
  badgeY: number;
  count: number;
};

type SelectCellOptions = {
  onSettled?: () => void;
  preserveSpyNotice?: boolean;
  focusPlanetZ?: number | null;
};

type ReloadGalaxyPresentationOptions = {
  restoreSelectedCell?: boolean;
  autoSelectHomeSystem?: boolean;
  spyLaunchNotice?: string | null;
};

type SensorPhalanxOriginOption = {
  key: string;
  planet: ClientPlanetDto;
  label: string;
  distance: number;
  normalRange: number;
  activeScanRange: number;
  scanCostDeuterium: number;
  availableDeuterium: number;
};

@Component({
  selector: 'app-galactic-view',
  imports: [TopMenuComponent, MiniPlanetPreviewComponent, SpySolarSystemDialogComponent, FormsModule, TooltipDirective],
  templateUrl: './galactic-view.component.html',
  styleUrl: './galactic-view.styles.css'
})
export class GalacticViewComponent implements OnInit {
  private static readonly buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
  protected readonly gridCellSize = 22;
  protected readonly gridCellGap = 2;
  protected readonly gridPadding = 12;
  protected readonly maxNoteLength = 500;
  protected showFleetRoutes = true;
  protected readonly noteColorOptions: Array<{ label: string; value: NoteBorderColor }> = [
    { label: 'White', value: NoteBorderColor.WHITE },
    { label: 'Light Gray', value: NoteBorderColor.LIGHT_GRAY },
    { label: 'Gray', value: NoteBorderColor.GRAY },
    { label: 'Yellow', value: NoteBorderColor.YELLOW },
    { label: 'Orange', value: NoteBorderColor.ORANGE },
    { label: 'Red', value: NoteBorderColor.RED },
    { label: 'Light Green', value: NoteBorderColor.LIGHT_GREEN },
    { label: 'Green', value: NoteBorderColor.GREEN },
    { label: 'Light Blue', value: NoteBorderColor.LIGHT_BLUE },
    { label: 'Blue', value: NoteBorderColor.BLUE },
    { label: 'Light Purple', value: NoteBorderColor.LIGHT_PURPLE },
    { label: 'Purple', value: NoteBorderColor.PURPLE },
    { label: 'Brown', value: NoteBorderColor.BROWN }
  ];
  protected galaxyPresentation: GalaxyPresentationDataDto | null = null;
  protected grid: GalacticCellVm[][] = [];
  protected gridWidth = 0;
  protected gridHeight = 0;
  protected galaxyName: string | null = null;
  protected homeSystemCoordinates: { x: number; y: number } | null = null;
  protected topScrollContentWidth = 0;
  protected isLoading = false;
  protected loadError: string | null = null;
  protected selectedCell: GalacticCellVm | null = null;
  protected selectedSystem: ClientStarSystemDto | null = null;
  protected selectedSystemLoading = false;
  protected selectedSystemError: string | null = null;
  protected selectedSystemPlanets: ClientPlanetDto[] = [];
  protected selectedPlanetZ: number | null = null;
  protected selectedSystemOwnFleets: GalaxyOwnFleetMovementDto[] = [];
  protected selectedSystemInboundOwnFleets: GalaxyOwnFleetMovementDto[] = [];
  protected ownFleetRoutes: GalacticRouteVm[] = [];
  protected noteActionError: string | null = null;
  protected isSpySolarSystemDialogOpen = false;
  protected spySolarSystemNotice: string | null = null;
  protected isNoteActionLoading = false;
  protected isNoteEditorOpen = false;
  protected noteEditorMode: 'add' | 'modify' = 'add';
  protected noteEditorText = '';
  protected noteEditorColor: NoteBorderColor = NoteBorderColor.WHITE;
  protected noteEditorError: string | null = null;
  protected isDeleteNoteConfirmOpen = false;
  protected isSensorPhalanxDialogOpen = false;
  protected sensorPhalanxTarget: ClientPlanetDto | null = null;
  protected sensorPhalanxOriginOptions: SensorPhalanxOriginOption[] = [];
  protected selectedSensorPhalanxOriginKey = '';
  protected sensorPhalanxCapabilities: SensorPhalanxCapabilitiesDto | null = null;
  protected sensorPhalanxResult: SensorPhalanxScanResponse | null = null;
  protected sensorPhalanxError: string | null = null;
  protected sensorPhalanxLoading = false;
  protected sensorPhalanxScanning = false;
  @ViewChild('topScroll') private topScrollRef?: ElementRef<HTMLDivElement>;
  @ViewChild('bottomScroll') private bottomScrollRef?: ElementRef<HTMLDivElement>;
  private isSyncingScroll = false;
  private starSystemNotesByCoordinates = new Map<string, StarSystemNoteDto>();
  private starSystemCache = new Map<string, ClientStarSystemDto>();
  private ownFleetPresenceBySystemKey = new Set<string>();
  private sensorPhalanxScannableSystemKeys = new Set<string>();
  private selectedSystemRequestKey: string | null = null;
  private pendingRouteFocus: { x: number; y: number; z: number | null } | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly gameState: GameStateService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {}

  public ngOnInit(): void {
    this.galaxyName = this.resolveGalaxyName();
    this.route.queryParamMap.subscribe((params) => {
      this.pendingRouteFocus = this.parseRouteFocus({
        x: params.get('x'),
        y: params.get('y'),
        z: params.get('z')
      });
      if (this.gridHeight > 0 && this.gridWidth > 0) {
        this.applyRouteFocusIfPossible();
      }
    });
    this.loadGalaxyPresentation({ autoSelectHomeSystem: true });
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.syncScrollbars();
  }

  protected onTopScrollbarScroll(): void {
    if (this.isSyncingScroll) {
      return;
    }

    const top = this.topScrollRef?.nativeElement;
    const bottom = this.bottomScrollRef?.nativeElement;
    if (!top || !bottom) {
      return;
    }

    this.isSyncingScroll = true;
    bottom.scrollLeft = top.scrollLeft;
    this.isSyncingScroll = false;
  }

  protected onBottomScrollbarScroll(): void {
    if (this.isSyncingScroll) {
      return;
    }

    const top = this.topScrollRef?.nativeElement;
    const bottom = this.bottomScrollRef?.nativeElement;
    if (!top || !bottom) {
      return;
    }

    this.isSyncingScroll = true;
    top.scrollLeft = bottom.scrollLeft;
    this.isSyncingScroll = false;
  }

  protected onCellClick(cell: GalacticCellVm): void {
    this.selectCell(cell);
  }

  protected isHomeSystemCell(cell: GalacticCellVm): boolean {
    return this.homeSystemCoordinates?.x === cell.x && this.homeSystemCoordinates?.y === cell.y;
  }

  protected isHighlightedPlanet(planet: ClientPlanetDto): boolean {
    return this.selectedPlanetZ !== null && planet.coordinates.z === this.selectedPlanetZ;
  }

  private selectCell(cell: GalacticCellVm, options: SelectCellOptions = {}): void {
    this.selectedCell = cell;
    this.selectedPlanetZ = options.focusPlanetZ ?? null;
    this.selectedSystem = null;
    this.selectedSystemPlanets = [];
    this.selectedSystemError = null;
    this.noteActionError = null;
    if (!options.preserveSpyNotice) {
      this.spySolarSystemNotice = null;
    }
    this.isSpySolarSystemDialogOpen = false;
    this.closeSensorPhalanxDialog();
    this.noteEditorError = null;
    this.isNoteEditorOpen = false;
    this.isDeleteNoteConfirmOpen = false;
    this.selectedSystemLoading = false;
    this.selectedSystemRequestKey = null;
    this.selectedSystemOwnFleets = this.listOwnFleetsForSystem(cell.x, cell.y);
    this.selectedSystemInboundOwnFleets = this.listInboundOwnFleetsForSystem(cell.x, cell.y);

    const key = this.buildCoordinatesKey(cell.x, cell.y);
    const cached = this.starSystemCache.get(key);
    if (cached) {
      this.selectedSystem = cached;
      this.selectedSystemPlanets = this.sortPlanetsByOrder(cached.planets);
      options.onSettled?.();
      this.cdr.markForCheck();
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.selectedSystemError = 'No player session found. Start a new game.';
      options.onSettled?.();
      this.cdr.markForCheck();
      return;
    }

    this.selectedSystemLoading = true;
    this.selectedSystemRequestKey = key;

    this.gameApi.getClientStarSystem(cell.x, cell.y, session.token)
      .pipe(finalize(() => {
        if (this.selectedSystemRequestKey !== key) {
          return;
        }

        this.selectedSystemLoading = false;
        options.onSettled?.();
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (system) => {
          if (this.selectedSystemRequestKey !== key) {
            return;
          }

          this.starSystemCache.set(key, system);
          this.selectedSystem = system;
          this.selectedSystemPlanets = this.sortPlanetsByOrder(system.planets);
          this.cdr.markForCheck();
        },
        error: () => {
          if (this.selectedSystemRequestKey !== key) {
            return;
          }

          this.selectedSystemError = 'Unable to load selected star system.';
          this.cdr.markForCheck();
        }
      });
  }

  protected selectedCoordinatesLabel(): string {
    if (!this.selectedCell) {
      return '--:--';
    }

    return `${this.selectedCell.x}:${this.selectedCell.y}`;
  }

  protected selectedStarSystemNameLabel(): string {
    if (this.selectedSystem?.name?.trim()) {
      return this.selectedSystem.name;
    }

    if (this.selectedCell?.isVoid) {
      return 'Void';
    }
    if (this.selectedCell?.isCenter) {
      return 'Galaxy Center';
    }

    return 'Unknown Star System';
  }

  protected selectedPlanetsCountLabel(): number {
    return this.selectedCell?.planetsCount ?? 0;
  }

  protected selectedAsteroidsCountLabel(): number {
    return this.selectedCell?.asteroidsCount ?? 0;
  }

  protected gridCanvasWidth(): number {
    if (this.gridWidth <= 0) {
      return 0;
    }

    return (this.gridWidth * this.gridCellSize)
      + (Math.max(0, this.gridWidth - 1) * this.gridCellGap)
      + (this.gridPadding * 2);
  }

  protected gridCanvasHeight(): number {
    if (this.gridHeight <= 0) {
      return 0;
    }

    return (this.gridHeight * this.gridCellSize)
      + (Math.max(0, this.gridHeight - 1) * this.gridCellGap)
      + (this.gridPadding * 2);
  }

  protected ownFleetMissionLabel(fleet: GalaxyOwnFleetMovementDto): string {
    return fleet.missionType === 'Defend' ? 'Guard' : fleet.missionType;
  }

  protected ownFleetStatusLabel(fleet: GalaxyOwnFleetMovementDto): string {
    switch (fleet.state) {
      case 'PENDING_JUMP_GATE':
        return 'Pending Jump Gate';
      case 'MOVING_TO_TARGET':
        return 'En route';
      case 'ORBITING':
        return 'On station';
      case 'RETURNING':
        return 'Returning';
      case 'MISSION_FAILURE_RETURNING':
        return 'Failure return';
      default:
        return fleet.state;
    }
  }

  protected ownFleetRouteLabel(fleet: GalaxyOwnFleetMovementDto): string {
    if (fleet.routeKind === 'RETURNING') {
      return `${fleet.targetPlanetName} -> ${fleet.originPlanetName}`;
    }

    return `${fleet.originPlanetName} -> ${fleet.targetPlanetName}`;
  }

  protected ownFleetEtaLabel(fleet: GalaxyOwnFleetMovementDto): string {
    if (fleet.etaTurns === null) {
      return 'No active ETA';
    }

    return `${fleet.etaTurns} turn${fleet.etaTurns === 1 ? '' : 's'}`;
  }

  protected visibleOwnFleetRoutes(): GalacticRouteVm[] {
    return this.showFleetRoutes ? this.ownFleetRoutes : [];
  }

  protected selectedStarSystemNote(): StarSystemNoteDto | null {
    if (!this.selectedCell) {
      return null;
    }

    return this.starSystemNotesByCoordinates.get(
      this.buildCoordinatesKey(this.selectedCell.x, this.selectedCell.y)
    ) ?? null;
  }

  protected isSpecialSelectedCell(): boolean {
    return !!this.selectedCell && (this.selectedCell.isVoid || this.selectedCell.isCenter);
  }

  protected selectedSpecialInfoLabel(): string | null {
    if (!this.selectedCell) {
      return null;
    }

    if (this.selectedCell.isVoid) {
      return 'This is void.';
    }
    if (this.selectedCell.isCenter) {
      return 'This is galaxy center.';
    }

    return null;
  }

  protected areNoteActionsDisabled(): boolean {
    return !this.selectedCell || this.isSpecialSelectedCell() || this.isNoteActionLoading;
  }

  protected canOpenSpySolarSystemDialog(): boolean {
    return !!this.selectedSystem
      && !this.selectedSystemLoading
      && this.selectedSystemSpyTargets().length > 0;
  }

  protected spySolarSystemButtonTitle(): string {
    if (this.selectedSystemLoading) {
      return 'Wait for the selected system to finish loading.';
    }
    if (!this.selectedSystem) {
      return 'Select a star system first.';
    }
    if (this.selectedSystemSpyTargets().length <= 0) {
      return 'No non-owned, non-asteroid planets are available in this star system.';
    }

    return `Launch one probe per eligible planet in ${this.selectedStarSystemNameLabel()}.`;
  }

  protected openSpySolarSystemDialog(): void {
    if (!this.canOpenSpySolarSystemDialog()) {
      return;
    }

    this.spySolarSystemNotice = null;
    this.isSpySolarSystemDialogOpen = true;
  }

  protected closeSpySolarSystemDialog(): void {
    this.isSpySolarSystemDialogOpen = false;
  }

  protected handleSpySolarSystemLaunched(event: { message: string }): void {
    this.isSpySolarSystemDialogOpen = false;
    this.loadGalaxyPresentation({
      restoreSelectedCell: true,
      spyLaunchNotice: event.message
    });
  }

  protected selectedSystemSpyTargets(): ClientPlanetDto[] {
    if (!this.selectedSystem) {
      return [];
    }

    return this.selectedSystem.planets.filter((planet) =>
      planet.basicInfo.type !== PlanetType.ASTEROIDS && !planet.info.isOwnedByViewer
    );
  }

  protected canSensorPhalanxScanPlanet(planet: ClientPlanetDto): boolean {
    return this.resolveSensorPhalanxOriginOptions(planet).length > 0;
  }

  protected openSensorPhalanxDialog(planet: ClientPlanetDto): void {
    const origins = this.resolveSensorPhalanxOriginOptions(planet);
    if (origins.length <= 0) {
      return;
    }

    this.sensorPhalanxTarget = planet;
    this.sensorPhalanxOriginOptions = origins;
    this.selectedSensorPhalanxOriginKey = origins[0].key;
    this.sensorPhalanxCapabilities = null;
    this.sensorPhalanxResult = null;
    this.sensorPhalanxError = null;
    this.isSensorPhalanxDialogOpen = true;
    this.loadSelectedSensorPhalanxCapabilities();
  }

  protected closeSensorPhalanxDialog(): void {
    this.isSensorPhalanxDialogOpen = false;
    this.sensorPhalanxTarget = null;
    this.sensorPhalanxOriginOptions = [];
    this.selectedSensorPhalanxOriginKey = '';
    this.sensorPhalanxCapabilities = null;
    this.sensorPhalanxResult = null;
    this.sensorPhalanxError = null;
    this.sensorPhalanxLoading = false;
    this.sensorPhalanxScanning = false;
  }

  protected selectedSensorPhalanxOrigin(): SensorPhalanxOriginOption | null {
    return this.sensorPhalanxOriginOptions.find((origin) => origin.key === this.selectedSensorPhalanxOriginKey) ?? null;
  }

  protected onSensorPhalanxOriginChanged(originKey: string): void {
    this.selectedSensorPhalanxOriginKey = originKey;
    this.sensorPhalanxCapabilities = null;
    this.sensorPhalanxResult = null;
    this.sensorPhalanxError = null;
    this.loadSelectedSensorPhalanxCapabilities();
  }

  protected canSubmitSensorPhalanxScan(): boolean {
    const origin = this.selectedSensorPhalanxOrigin();
    const capabilities = this.sensorPhalanxCapabilities;
    return !!this.sensorPhalanxTarget
      && !!origin
      && !!capabilities
      && !this.sensorPhalanxLoading
      && !this.sensorPhalanxScanning
      && capabilities.remainingScans > 0
      && origin.availableDeuterium >= capabilities.scanCostDeuterium;
  }

  protected executeSensorPhalanxScan(): void {
    const session = this.playerSession.load();
    const origin = this.selectedSensorPhalanxOrigin();
    const target = this.sensorPhalanxTarget;
    if (!session || !origin || !target || !this.canSubmitSensorPhalanxScan()) {
      return;
    }

    this.sensorPhalanxScanning = true;
    this.sensorPhalanxError = null;

    this.gameApi.scanSensorPhalanx({
      origin: origin.planet.coordinates,
      target: target.coordinates
    }, session.token)
      .pipe(finalize(() => {
        this.sensorPhalanxScanning = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.sensorPhalanxResult = response;
          this.sensorPhalanxCapabilities = response.capabilities;
          this.sensorPhalanxOriginOptions = this.sensorPhalanxOriginOptions.map((option) =>
            option.key === origin.key
              ? {
                ...option,
                availableDeuterium: Math.max(0, option.availableDeuterium - response.capabilities.scanCostDeuterium)
              }
              : option
          );
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.sensorPhalanxError = error?.error?.error ?? 'Unable to run Sensor Phalanx scan.';
          this.cdr.markForCheck();
        }
      });
  }

  protected sensorPhalanxTargetLabel(): string {
    const target = this.sensorPhalanxTarget;
    if (!target) {
      return 'No target selected';
    }

    return `${target.basicInfo.name} (${target.coordinates.x}:${target.coordinates.y}:${target.coordinates.z})`;
  }

  protected sensorPhalanxContactLabel(contact: SensorPhalanxFleetContactDto): string {
    return `${contact.direction} | Size ${contact.fleetSize} | ETA ${contact.etaTurns} | ${contact.isAllied ? 'Allied' : 'Unknown or hostile'}`;
  }

  protected openAddNoteDialog(): void {
    if (this.areNoteActionsDisabled() || this.selectedStarSystemNote()) {
      return;
    }

    this.noteEditorMode = 'add';
    this.noteEditorText = '';
    this.noteEditorColor = NoteBorderColor.WHITE;
    this.noteEditorError = null;
    this.noteActionError = null;
    this.isNoteEditorOpen = true;
  }

  protected openModifyNoteDialog(): void {
    if (this.areNoteActionsDisabled()) {
      return;
    }

    const note = this.selectedStarSystemNote();
    if (!note) {
      return;
    }

    this.noteEditorMode = 'modify';
    this.noteEditorText = note.text;
    this.noteEditorColor = note.borderColor;
    this.noteEditorError = null;
    this.noteActionError = null;
    this.isNoteEditorOpen = true;
  }

  protected closeNoteEditor(): void {
    this.isNoteEditorOpen = false;
    this.noteEditorError = null;
  }

  protected saveNote(): void {
    if (this.areNoteActionsDisabled() || !this.selectedCell) {
      return;
    }

    const noteText = this.noteEditorText.trim();
    if (!noteText) {
      this.noteEditorError = 'Note text cannot be empty.';
      return;
    }
    if (noteText.length > this.maxNoteLength) {
      this.noteEditorError = `Note text cannot exceed ${this.maxNoteLength} characters.`;
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.noteEditorError = 'No player session found. Start a new game.';
      return;
    }

    this.isNoteActionLoading = true;
    this.noteEditorError = null;
    this.noteActionError = null;

    const { x, y } = this.selectedCell;
    this.gameApi.createOrUpdateStarSystemNote(
      {
        x,
        y,
        borderColor: this.noteEditorColor,
        text: noteText
      },
      session.token
    )
      .pipe(finalize(() => {
        this.isNoteActionLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (note) => {
          this.upsertLocalNote(note);
          this.isNoteEditorOpen = false;
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.noteEditorError = error?.error?.error ?? 'Unable to save note.';
          this.cdr.markForCheck();
        }
      });
  }

  protected openDeleteNoteConfirm(): void {
    if (this.areNoteActionsDisabled() || !this.selectedStarSystemNote()) {
      return;
    }

    this.noteActionError = null;
    this.isDeleteNoteConfirmOpen = true;
  }

  protected closeDeleteNoteConfirm(): void {
    this.isDeleteNoteConfirmOpen = false;
  }

  protected deleteNote(): void {
    if (this.areNoteActionsDisabled() || !this.selectedCell) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.noteActionError = 'No player session found. Start a new game.';
      return;
    }

    this.isNoteActionLoading = true;
    this.noteActionError = null;

    const { x, y } = this.selectedCell;
    this.gameApi.deleteStarSystemNote(x, y, session.token)
      .pipe(finalize(() => {
        this.isNoteActionLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.removeLocalNote(x, y);
          this.isDeleteNoteConfirmOpen = false;
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.noteActionError = error?.error?.error ?? 'Unable to delete note.';
          this.cdr.markForCheck();
        }
      });
  }

  protected noteEditorTitleLabel(): string {
    return this.noteEditorMode === 'add' ? 'Add Note' : 'Modify Note';
  }

  private loadGalaxyPresentation(options: ReloadGalaxyPresentationOptions = {}): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found. Start a new game.';
      return;
    }

    const selectedCoordinates = options.restoreSelectedCell && this.selectedCell
      ? { x: this.selectedCell.x, y: this.selectedCell.y }
      : null;

    this.isLoading = true;
    this.loadError = null;

    this.gameApi.getGalaxyPresentationData(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.galaxyPresentation = response;
          this.starSystemNotesByCoordinates = this.buildStarSystemNotesMap(response.starSystemNotes);
          this.ownFleetPresenceBySystemKey = this.buildOwnFleetPresenceBySystemKey(response);
          this.sensorPhalanxScannableSystemKeys = this.buildSensorPhalanxScannableSystemKeys(response);
          this.ownFleetRoutes = this.buildOwnFleetRoutes(response.ownFleetMovements);
          this.starSystemCache.clear();
          this.grid = this.buildGrid(response);
          this.gridHeight = this.grid.length;
          this.gridWidth = this.grid[0]?.length ?? 0;
          this.homeSystemCoordinates = this.resolveHomeSystemCoordinates(response.ownedPlanets);
          this.syncScrollbars();

          if (selectedCoordinates) {
            const selectedCell = this.grid[selectedCoordinates.y]?.[selectedCoordinates.x] ?? null;
            if (selectedCell) {
              this.selectCell(selectedCell, {
                preserveSpyNotice: !!options.spyLaunchNotice,
                onSettled: () => {
                  if (options.spyLaunchNotice) {
                    this.spySolarSystemNotice = options.spyLaunchNotice;
                  }
                }
              });
            } else if (this.applyRouteFocusIfPossible()) {
              // Route focus handled.
            }
          } else if (options.autoSelectHomeSystem) {
            if (!this.applyRouteFocusIfPossible()) {
              this.autoSelectHomeSystem(() => {
                this.tutorialService.autoOpenTutorial('galacticView');
              });
            }
          }

          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Unable to load galaxy from server.';
          this.cdr.markForCheck();
        }
      });
  }

  private loadSelectedSensorPhalanxCapabilities(): void {
    const session = this.playerSession.load();
    const origin = this.selectedSensorPhalanxOrigin();
    if (!session || !origin) {
      this.sensorPhalanxError = 'No Sensor Phalanx origin selected.';
      return;
    }

    this.sensorPhalanxLoading = true;
    this.sensorPhalanxError = null;

    const coordinates = origin.planet.coordinates;
    this.gameApi.getSensorPhalanxCapabilities(
      coordinates.x,
      coordinates.y,
      coordinates.z,
      session.token
    )
      .pipe(finalize(() => {
        this.sensorPhalanxLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (capabilities) => {
          this.sensorPhalanxCapabilities = capabilities;
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.sensorPhalanxError = error?.error?.error ?? 'Unable to load Sensor Phalanx capability.';
          this.cdr.markForCheck();
        }
      });
  }

  private resolveSensorPhalanxOriginOptions(target: ClientPlanetDto): SensorPhalanxOriginOption[] {
    const ownedPlanets = this.galaxyPresentation?.ownedPlanets ?? [];
    return ownedPlanets
      .map((planet) => this.toSensorPhalanxOriginOption(planet, target.coordinates))
      .filter((option): option is SensorPhalanxOriginOption => option !== null)
      .sort((left, right) =>
        (right.activeScanRange - right.distance) - (left.activeScanRange - left.distance)
          || left.scanCostDeuterium - right.scanCostDeuterium
          || left.label.localeCompare(right.label)
      );
  }

  private toSensorPhalanxOriginOption(
    planet: ClientPlanetDto,
    target: ClientCoordinates
  ): SensorPhalanxOriginOption | null {
    const level = this.getBuildingLevel(planet, BuildingType.SENSOR_PHALANX);
    if (level <= 0) {
      return null;
    }

    const blueprint = GalacticViewComponent.buildingBlueprints.get(BuildingType.SENSOR_PHALANX);
    if (!blueprint) {
      return null;
    }

    const baseRange = blueprint.production1[level - 1] ?? 0;
    const effectiveness = this.getBuildingEffectiveness(planet, BuildingType.SENSOR_PHALANX, blueprint.powerConsumption);
    const normalRange = calculateSensorPhalanxNormalRange(
      baseRange,
      planet.info.planetaryParameters.anomaliesAndNoise,
      effectiveness
    );
    const activeScanRange = calculateSensorPhalanxActiveScanRange(normalRange);
    const distance = this.calculatePlanetDistance(planet.coordinates, target);
    if (activeScanRange <= 0 || distance > activeScanRange) {
      return null;
    }

    return {
      key: this.buildPlanetCoordinatesKey(planet.coordinates),
      planet,
      label: `${planet.basicInfo.name} (${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z})`,
      distance,
      normalRange,
      activeScanRange,
      scanCostDeuterium: Math.max(0, Math.floor(blueprint.production2[level - 1] ?? 0)),
      availableDeuterium: Math.max(0, Math.floor(planet.objects.resources.deuterium))
    };
  }

  private getBuildingLevel(planet: ClientPlanetDto, type: BuildingType): number {
    return Math.max(0, Math.floor(
      planet.objects.buildingsLevels.find((entry) => entry.type === type)?.level ?? 0
    ));
  }

  private getBuildingEffectiveness(planet: ClientPlanetDto, type: BuildingType, powerConsumption: number): number {
    return this.getBuildingPowerUtilization(planet, type, powerConsumption)
      * this.getBuildingStructuralUtilization(planet, type);
  }

  private getBuildingPowerUtilization(planet: ClientPlanetDto, type: BuildingType, powerConsumption: number): number {
    const level = this.getBuildingLevel(planet, type);
    const maxPower = level * Math.max(0, powerConsumption);
    if (maxPower <= 0) {
      return 1;
    }

    const currentPower = planet.objects.buildingsCurrentPowerConsumption
      .find((entry) => entry.type === type)?.currentPowerConsumption ?? maxPower;
    if (!Number.isFinite(currentPower) || currentPower <= 0) {
      return 0;
    }

    return Math.min(1, Math.max(0, currentPower / maxPower));
  }

  private getBuildingStructuralUtilization(planet: ClientPlanetDto, type: BuildingType): number {
    const structural = planet.objects.buildingsCurrentStructuralPoints.find((entry) => entry.type === type);
    if (!structural || structural.maxStructuralPoints <= 0) {
      return 1;
    }

    const ratio = structural.currentStructuralPoints > 0
      ? structural.currentStructuralPoints / structural.maxStructuralPoints
      : 0;
    return Math.min(1, Math.max(0, ratio));
  }

  private calculatePlanetDistance(origin: ClientCoordinates, target: ClientCoordinates): number {
    return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
  }

  private buildSensorPhalanxScannableSystemKeys(data: GalaxyPresentationDataDto): Set<string> {
    const keys = new Set<string>();
    const origins = data.ownedPlanets
      .map((planet) => this.toSensorPhalanxCoverage(planet))
      .filter((coverage): coverage is { coordinates: ClientCoordinates; activeScanRange: number } => coverage !== null);

    if (origins.length <= 0) {
      return keys;
    }

    for (let y = 0; y < data.galaxyBytes.length; y += 1) {
      const row = data.galaxyBytes[y] ?? [];
      for (let x = 0; x < row.length; x += 1) {
        const cell = row[x];
        if (!cell || cell.planetsAndAsteroids[0] <= 0) {
          continue;
        }

        const planetCount = Math.max(0, cell.planetsAndAsteroids[0]);
        for (let z = 0; z < planetCount; z += 1) {
          const target = { x, y, z };
          if (origins.some((origin) => this.calculatePlanetDistance(origin.coordinates, target) <= origin.activeScanRange)) {
            keys.add(this.buildCoordinatesKey(x, y));
            break;
          }
        }
      }
    }

    return keys;
  }

  private toSensorPhalanxCoverage(planet: ClientPlanetDto): { coordinates: ClientCoordinates; activeScanRange: number } | null {
    const level = this.getBuildingLevel(planet, BuildingType.SENSOR_PHALANX);
    if (level <= 0) {
      return null;
    }

    const blueprint = GalacticViewComponent.buildingBlueprints.get(BuildingType.SENSOR_PHALANX);
    if (!blueprint) {
      return null;
    }

    const normalRange = calculateSensorPhalanxNormalRange(
      blueprint.production1[level - 1] ?? 0,
      planet.info.planetaryParameters.anomaliesAndNoise,
      this.getBuildingEffectiveness(planet, BuildingType.SENSOR_PHALANX, blueprint.powerConsumption)
    );
    const activeScanRange = calculateSensorPhalanxActiveScanRange(normalRange);
    return activeScanRange > 0
      ? { coordinates: planet.coordinates, activeScanRange }
      : null;
  }

  private syncScrollbars(): void {
    setTimeout(() => {
      const top = this.topScrollRef?.nativeElement;
      const bottom = this.bottomScrollRef?.nativeElement;
      if (!top || !bottom) {
        return;
      }

      this.topScrollContentWidth = bottom.scrollWidth;
      top.scrollLeft = bottom.scrollLeft;
      this.cdr.markForCheck();
    }, 0);
  }

  private resolveGalaxyName(): string | null {
    const stateGalaxyName = this.gameState.galaxy?.name?.trim();
    if (stateGalaxyName) {
      return stateGalaxyName;
    }

    const storedSetup = localStorage.getItem('srogame:setup');
    if (!storedSetup) {
      return null;
    }

    try {
      const parsed = JSON.parse(storedSetup) as GalaxySetup;
      const setupGalaxyName = parsed?.galaxyName?.trim();
      return setupGalaxyName ? setupGalaxyName : null;
    } catch {
      return null;
    }
  }

  private autoSelectHomeSystem(onSettled: () => void): void {
    if (this.selectedCell) {
      onSettled();
      return;
    }

    const homeCoordinates = this.homeSystemCoordinates;
    if (!homeCoordinates) {
      onSettled();
      return;
    }

    const homeCell = this.grid[homeCoordinates.y]?.[homeCoordinates.x] ?? null;
    if (!homeCell) {
      onSettled();
      return;
    }

    this.selectCell(homeCell, { onSettled });
  }

  private applyRouteFocusIfPossible(): boolean {
    if (!this.pendingRouteFocus) {
      return false;
    }

    const targetCell = this.grid[this.pendingRouteFocus.y]?.[this.pendingRouteFocus.x] ?? null;
    if (!targetCell) {
      return false;
    }

    this.selectCell(targetCell, {
      focusPlanetZ: this.pendingRouteFocus.z
    });
    return true;
  }

  private parseRouteFocus(query: { x: string | null; y: string | null; z: string | null }): { x: number; y: number; z: number | null } | null {
    const x = this.parseQueryCoordinate(query.x);
    const y = this.parseQueryCoordinate(query.y);
    if (x === null || y === null) {
      return null;
    }

    return {
      x,
      y,
      z: this.parseQueryCoordinate(query.z)
    };
  }

  private parseQueryCoordinate(value: string | null): number | null {
    if (value === null || value.trim().length <= 0) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private resolveHomeSystemCoordinates(
    ownedPlanets: ClientPlanetDto[]
  ): { x: number; y: number } | null {
    if (ownedPlanets.length === 0) {
      return null;
    }

    const homePlanet = [...ownedPlanets].sort(
      (left, right) => left.basicInfo.order - right.basicInfo.order
    )[0];

    return {
      x: homePlanet.coordinates.x,
      y: homePlanet.coordinates.y
    };
  }

  private buildGrid(data: GalaxyPresentationDataDto): GalacticCellVm[][] {
    return data.galaxyBytes.map((row, y) =>
      row.map((cell, x) => {
        const ownershipCell = data.ownershipBytes[y]?.[x] ?? null;
        const note = this.starSystemNotesByCoordinates.get(this.buildCoordinatesKey(x, y)) ?? null;
        return this.toCellVm(cell, ownershipCell, note, x, y);
      })
    );
  }

  private toCellVm(
    galaxyByte: GalaxyByteCellDto,
    ownershipCell: OwnershipByteCellDto | null,
    note: StarSystemNoteDto | null,
    x: number,
    y: number
  ): GalacticCellVm {
    const planets = galaxyByte.planetsAndAsteroids[0];
    const asteroids = galaxyByte.planetsAndAsteroids[1];
    const isVoid = planets === -1;
    const isCenter = planets === -2;
    const planetsCount = isVoid || isCenter ? 0 : Math.max(0, planets);
    const asteroidsCount = isVoid || isCenter ? 0 : Math.max(0, asteroids);
    const ownership = ownershipCell?.ownership ?? null;
    const fillKind = this.resolveFillKind(ownership, isVoid, isCenter);
    const valueLabel = this.buildValueLabel(planets, asteroids, isVoid, isCenter);
    const ownedPlanetsDotsLabel = this.buildOwnedPlanetsDotsLabel(ownership, isVoid, isCenter);
    const hasOwnFleetPresence = this.ownFleetPresenceBySystemKey.has(this.buildCoordinatesKey(x, y));
    const isSensorScannable = !isVoid
      && !isCenter
      && this.sensorPhalanxScannableSystemKeys.has(this.buildCoordinatesKey(x, y));
    const noteBorderColor = note?.borderColor ?? null;
    const noteText = note?.text?.trim() ? note.text.trim() : null;

    return {
      x,
      y,
      isVoid,
      isCenter,
      planetsCount,
      asteroidsCount,
      fillKind,
      valueLabel,
      ownedPlanetsDotsLabel,
      hasOwnFleetPresence,
      isSensorScannable,
      noteBorderColor,
      coordsLabel: `${x}:${y}`,
      tooltip: this.buildTooltip(
        x,
        y,
        planets,
        asteroids,
        ownership,
        isVoid,
        isCenter,
        noteText
      )
    };
  }

  private resolveFillKind(
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean
  ): CellFillKind {
    if (isVoid) {
      return 'void';
    }
    if (isCenter) {
      return 'center';
    }
    if (ownership === null) {
      return 'noData';
    }

    const [ownedByPlayer, neutralOwned, botOwned, humanOwned] = ownership;
    const hasPlayer = ownedByPlayer > 0;
    const hasNeutral = neutralOwned > 0;
    const hasBot = botOwned > 0;
    const hasHuman = humanOwned > 0;

    if (hasPlayer && (hasHuman || hasBot)) {
      return 'playerAndEnemyAnyNeutral';
    }
    if (hasHuman && hasBot) {
      return 'humanBotAnyNeutral';
    }
    if (hasHuman) {
      return 'humanOrNeutral';
    }
    if (hasBot) {
      return 'botOrNeutral';
    }
    if (hasPlayer) {
      return 'playerOnly';
    }
    if (hasNeutral) {
      return 'neutralOnly';
    }

    return 'noData';
  }

  private buildValueLabel(
    planets: number,
    asteroids: number,
    isVoid: boolean,
    isCenter: boolean
  ): string {
    if (isVoid || isCenter) {
      return '';
    }

    const planetsLabel = planets > 0 ? `${planets}` : '';
    const asteroidDots = '.'.repeat(Math.max(0, Math.min(3, asteroids)));
    return `${planetsLabel}${asteroidDots}`;
  }

  private buildOwnedPlanetsDotsLabel(
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean
  ): string {
    if (isVoid || isCenter || ownership === null) {
      return '';
    }

    const ownedPlanets = Math.max(0, Math.min(4, ownership[0]));
    return '\u25CF'.repeat(ownedPlanets);
  }

  private buildTooltip(
    x: number,
    y: number,
    planets: number,
    asteroids: number,
    ownership: [number, number, number, number] | null,
    isVoid: boolean,
    isCenter: boolean,
    noteText: string | null
  ): string {
    const noteSegment = noteText ? `\nNote: ${noteText}` : '';

    if (isVoid) {
      return `${x},${y} | Void${noteSegment}`;
    }
    if (isCenter) {
      return `${x},${y} | Galaxy Center${noteSegment}`;
    }

    const visiblePlanets = Math.max(0, planets);
    const header = `${x},${y} | Planets: ${visiblePlanets}, Asteroids: ${asteroids}`;
    if (!ownership) {
      return `${header} | No espionage data${noteSegment}`;
    }

    const [ownedByPlayer, neutralOwned, botOwned, humanOwned] = ownership;
    return `${header} | You: ${ownedByPlayer}, Neutral: ${neutralOwned}, Bot: ${botOwned}, Human: ${humanOwned}${noteSegment}`;
  }

  private buildCoordinatesKey(x: number, y: number): string {
    return `${x}:${y}`;
  }

  private buildPlanetCoordinatesKey(coordinates: ClientCoordinates): string {
    return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
  }

  private buildOwnFleetPresenceBySystemKey(data: GalaxyPresentationDataDto): Set<string> {
    const ownedSystemKeys = new Set<string>();
    for (const planet of data.ownedPlanets) {
      ownedSystemKeys.add(this.buildCoordinatesKey(planet.coordinates.x, planet.coordinates.y));
    }

    const presenceKeys = new Set<string>();
    for (const fleet of data.ownFleetMovements) {
      const coordinates = fleet.currentSystemCoordinates;
      if (!coordinates) {
        continue;
      }

      const key = this.buildCoordinatesKey(coordinates.x, coordinates.y);
      if (ownedSystemKeys.has(key)) {
        presenceKeys.add(key);
      }
    }

    return presenceKeys;
  }

  private buildOwnFleetRoutes(fleets: GalaxyOwnFleetMovementDto[]): GalacticRouteVm[] {
    const routesByKey = new Map<string, GalacticRouteVm>();

    for (const fleet of fleets) {
      const start = fleet.routeKind === 'RETURNING'
        ? fleet.targetSystemCoordinates
        : fleet.originSystemCoordinates;
      const end = fleet.routeKind === 'RETURNING'
        ? fleet.originSystemCoordinates
        : fleet.targetSystemCoordinates;
      if (start.x === end.x && start.y === end.y) {
        continue;
      }

      const routeKey = `${fleet.routeKind}:${start.x}:${start.y}:${end.x}:${end.y}`;
      const existing = routesByKey.get(routeKey);
      if (existing) {
        existing.count += 1;
        continue;
      }

      const startCenter = this.cellCenter(start.x, start.y);
      const endCenter = this.cellCenter(end.x, end.y);
      routesByKey.set(routeKey, {
        key: routeKey,
        routeKind: fleet.routeKind,
        startX: startCenter.x,
        startY: startCenter.y,
        endX: endCenter.x,
        endY: endCenter.y,
        badgeX: (startCenter.x + endCenter.x) / 2,
        badgeY: (startCenter.y + endCenter.y) / 2,
        count: 1
      });
    }

    return Array.from(routesByKey.values()).sort((left, right) =>
      left.routeKind.localeCompare(right.routeKind)
        || left.key.localeCompare(right.key)
    );
  }

  private cellCenter(x: number, y: number): { x: number; y: number } {
    return {
      x: this.gridPadding + (x * (this.gridCellSize + this.gridCellGap)) + (this.gridCellSize / 2),
      y: this.gridPadding + (y * (this.gridCellSize + this.gridCellGap)) + (this.gridCellSize / 2)
    };
  }

  private listOwnFleetsForSystem(x: number, y: number): GalaxyOwnFleetMovementDto[] {
    const fleets = this.galaxyPresentation?.ownFleetMovements ?? [];
    return fleets
      .filter((fleet) => {
        const current = fleet.currentSystemCoordinates;
        return current?.x === x && current.y === y;
      })
      .sort((left, right) => left.fleetId - right.fleetId);
  }

  private listInboundOwnFleetsForSystem(x: number, y: number): GalaxyOwnFleetMovementDto[] {
    const fleets = this.galaxyPresentation?.ownFleetMovements ?? [];
    return fleets
      .filter((fleet) => {
        const destination = this.resolveFleetDestinationSystemCoordinates(fleet);
        const current = fleet.currentSystemCoordinates;
        return destination.x === x
          && destination.y === y
          && !(current?.x === x && current.y === y);
      })
      .sort((left, right) => left.fleetId - right.fleetId);
  }

  private resolveFleetDestinationSystemCoordinates(
    fleet: GalaxyOwnFleetMovementDto
  ): { x: number; y: number } {
    return fleet.routeKind === 'RETURNING'
      ? fleet.originSystemCoordinates
      : fleet.targetSystemCoordinates;
  }

  private buildStarSystemNotesMap(starSystemNotes: StarSystemNoteDto[]): Map<string, StarSystemNoteDto> {
    const map = new Map<string, StarSystemNoteDto>();
    for (const note of starSystemNotes) {
      map.set(this.buildCoordinatesKey(note.coordinates.x, note.coordinates.y), note);
    }

    return map;
  }

  private sortPlanetsByOrder(planets: ClientPlanetDto[]): ClientPlanetDto[] {
    return [...planets].sort((left, right) => left.basicInfo.order - right.basicInfo.order);
  }

  private refreshCellVm(x: number, y: number): void {
    if (!this.galaxyPresentation) {
      return;
    }

    const galaxyByte = this.galaxyPresentation.galaxyBytes[y]?.[x];
    if (!galaxyByte) {
      return;
    }

    const ownership = this.galaxyPresentation.ownershipBytes[y]?.[x] ?? null;
    const note = this.starSystemNotesByCoordinates.get(this.buildCoordinatesKey(x, y)) ?? null;
    const updatedCell = this.toCellVm(galaxyByte, ownership, note, x, y);

    if (!this.grid[y]) {
      return;
    }

    this.grid[y][x] = updatedCell;
    if (this.selectedCell?.x === x && this.selectedCell?.y === y) {
      this.selectedCell = updatedCell;
    }
  }

  private upsertLocalNote(note: StarSystemNoteDto): void {
    const key = this.buildCoordinatesKey(note.coordinates.x, note.coordinates.y);
    this.starSystemNotesByCoordinates.set(key, note);
    this.refreshCellVm(note.coordinates.x, note.coordinates.y);
  }

  private removeLocalNote(x: number, y: number): void {
    const key = this.buildCoordinatesKey(x, y);
    this.starSystemNotesByCoordinates.delete(key);
    this.refreshCellVm(x, y);
  }
}
