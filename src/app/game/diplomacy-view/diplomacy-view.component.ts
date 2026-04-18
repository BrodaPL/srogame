import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import {
  ClientPlanetDto,
  DiplomacyContactDto,
  DiplomaticProposalDto,
  DiplomacyViewResponse,
  ShipAmountEntry,
  MailRecipientDto,
  SupportRequestType
} from '../../models/game-api-types';
import {
  bombardmentPriorityLabel,
  BombardmentPriorities,
  BombardmentPrioritySelection,
  BombardmentPriorityTarget,
  emptyBombardmentPriorities
} from '../../models/bombardment/bombardment-priority';
import { DiplomaticStatus } from '../../models/diplomacy/diplomatic-status';
import { allowedDiplomaticProposalStatuses } from '../../models/diplomacy/diplomatic-proposal-rules';
import { BuildingType } from '../../models/enums/building-type';
import { FleetMissionType } from '../../models/enums/fleet-mission-type';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { MessageComposeDialogComponent } from '../ui/message-compose-dialog/message-compose-dialog.component';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const OFFENSIVE_SUPPORT_SHIP_TYPES = [...SHIP_BLUEPRINTS.shipsMap.values()]
  .filter((ship) => ship.weapons.length > 0)
  .map((ship) => ship.type);
const BOMBARDMENT_PRIORITY_OPTIONS: BombardmentPrioritySelection[] = [
  BombardmentPriorityTarget.DEFENCES,
  BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT,
  BombardmentPriorityTarget.DEFENCES_CANNOT_SHOOT_TO_ORBIT,
  BombardmentPriorityTarget.RESOURCE_BUILDINGS,
  BombardmentPriorityTarget.FACILITIES,
  ...Object.values(BuildingType)
];

@Component({
  selector: 'app-diplomacy-view',
  imports: [FormsModule, RouterLink, TopMenuComponent, MiniPlanetPreviewComponent, MessageComposeDialogComponent],
  templateUrl: './diplomacy-view.component.html',
  styleUrl: './diplomacy-view.component.css'
})
export class DiplomacyViewComponent implements OnInit {
  protected isLoading = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected actionSuccess: string | null = null;
  protected contacts: DiplomacyContactDto[] = [];
  protected activeProposals: DiplomaticProposalDto[] = [];
  protected ownedPlanets: ClientPlanetDto[] = [];
  protected selectedPlayerId: number | null = null;
  protected currentPlayerId: number | null = null;
  protected currentTurn: number | null = null;
  protected outgoingProposalSentThisTurn = false;
  protected activeContactActionPlayerId: number | null = null;
  protected composerOpen = false;
  protected composerLockedTargetPlayerId: number | null = null;
  protected composerLockedTargetPlayerName: string | null = null;

  private proposalSelectionByPlayerId = new Map<number, DiplomaticStatus>();
  private supportTypeSelectionByPlayerId = new Map<number, SupportRequestType>();
  private supportTargetSelectionByPlayerId = new Map<number, string>();
  private supportBombardmentPrioritiesByPlayerId = new Map<number, BombardmentPriorities>();
  protected supportRequestedMetalByPlayerId: Record<number, number> = {};
  protected supportRequestedCrystalByPlayerId: Record<number, number> = {};
  protected supportRequestedDeuteriumByPlayerId: Record<number, number> = {};
  protected supportRequestedShipsByPlayerId: Record<number, Partial<Record<string, number>>> = {};

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {}

  public ngOnInit(): void {
    this.loadDiplomacyView();
  }

  protected selectedContact(): DiplomacyContactDto | null {
    if (this.selectedPlayerId === null) {
      return null;
    }

    return this.contacts.find((contact) => contact.playerId === this.selectedPlayerId) ?? null;
  }

  protected visibleContacts(): DiplomacyContactDto[] {
    return this.contacts;
  }

  protected visibleContactCount(): number {
    return this.visibleContacts().length;
  }

  protected visibleContactCountLabel(): string {
    return `${this.visibleContactCount()}/${this.contacts.length}`;
  }

  protected selectContact(contact: DiplomacyContactDto): void {
    this.selectedPlayerId = contact.playerId;
    this.actionSuccess = null;
  }

  protected selectedProposalStatus(contact: DiplomacyContactDto): DiplomaticStatus {
    const stored = this.proposalSelectionByPlayerId.get(contact.playerId);
    if (stored && this.availableProposalStatuses(contact).includes(stored)) {
      return stored;
    }

    const fallback = this.availableProposalStatuses(contact)[0] ?? DiplomaticStatus.PEACE;
    this.proposalSelectionByPlayerId.set(contact.playerId, fallback);
    return fallback;
  }

  protected setSelectedProposalStatus(contact: DiplomacyContactDto, status: string): void {
    if (!this.availableProposalStatuses(contact).includes(status as DiplomaticStatus)) {
      return;
    }

    this.proposalSelectionByPlayerId.set(contact.playerId, status as DiplomaticStatus);
  }

  protected availableProposalStatuses(contact: DiplomacyContactDto): DiplomaticStatus[] {
    return allowedDiplomaticProposalStatuses(contact.currentStatus);
  }

  protected proposalAvailabilityCopy(contact: DiplomacyContactDto): string {
    if (contact.canSendProposal) {
      return 'Send one diplomacy proposal to this player this turn. It applies immediately if they accept.';
    }

    return contact.proposalBlockedReason ?? 'Diplomacy proposals are unavailable for this contact.';
  }

  protected availableSupportTypes(contact: DiplomacyContactDto): SupportRequestType[] {
    if (contact.currentStatus === DiplomaticStatus.ALLIED) {
      return ['RESOURCE_SUPPORT', 'PLANET_REPAIR', 'PLANET_DEFENSE', 'ATTACK_TARGET', 'BOMBARD_TARGET', 'SIEGE_TARGET'];
    }

    if (contact.currentStatus === DiplomaticStatus.PEACE) {
      return ['PLANET_REPAIR', 'PLANET_DEFENSE'];
    }

    return [];
  }

  protected selectedSupportType(contact: DiplomacyContactDto): SupportRequestType {
    const stored = this.supportTypeSelectionByPlayerId.get(contact.playerId);
    if (stored && this.availableSupportTypes(contact).includes(stored)) {
      return stored;
    }

    const fallback = this.availableSupportTypes(contact)[0] ?? 'PLANET_DEFENSE';
    this.supportTypeSelectionByPlayerId.set(contact.playerId, fallback);
    return fallback;
  }

  protected setSelectedSupportType(contact: DiplomacyContactDto, supportType: string): void {
    if (!this.availableSupportTypes(contact).includes(supportType as SupportRequestType)) {
      return;
    }

    this.supportTypeSelectionByPlayerId.set(contact.playerId, supportType as SupportRequestType);
  }

  protected supportAvailabilityCopy(contact: DiplomacyContactDto): string {
    if (this.availableSupportTypes(contact).length <= 0) {
      return 'Support requests are available only for PEACE and ALLIED contacts.';
    }

    if (this.supportNeedsOffensiveTarget(contact)) {
      return 'Offensive support requests target known hostile planets, carry minimum ship requirements, and after acceptance wait up to 3 turns for auto-launch.';
    }

    return 'Requests are created here and resolved through Mail. Resource support allows partial approval; all support requests expire after 2 turns.';
  }

  protected supportNeedsResources(contact: DiplomacyContactDto): boolean {
    return this.selectedSupportType(contact) === 'RESOURCE_SUPPORT';
  }

  protected supportNeedsFriendlyTarget(contact: DiplomacyContactDto): boolean {
    const supportType = this.selectedSupportType(contact);
    return supportType === 'RESOURCE_SUPPORT' || supportType === 'PLANET_REPAIR' || supportType === 'PLANET_DEFENSE';
  }

  protected supportNeedsOffensiveTarget(contact: DiplomacyContactDto): boolean {
    return !this.supportNeedsFriendlyTarget(contact);
  }

  protected availableSupportTargetPlanets(contact: DiplomacyContactDto): ClientPlanetDto[] {
    if (this.supportNeedsFriendlyTarget(contact)) {
      return this.ownedPlanets;
    }

    return this.contacts
      .filter((candidate) => candidate.playerId !== contact.playerId)
      .filter((candidate) => this.isContactValidOffensiveTarget(candidate, this.selectedSupportType(contact)))
      .flatMap((candidate) => candidate.knownPlanets)
      .sort((left, right) =>
        left.coordinates.x - right.coordinates.x
        || left.coordinates.y - right.coordinates.y
        || left.coordinates.z - right.coordinates.z
      );
  }

  protected selectedSupportTargetPlanetKey(contact: DiplomacyContactDto): string {
    const stored = this.supportTargetSelectionByPlayerId.get(contact.playerId);
    const availableTargets = this.availableSupportTargetPlanets(contact);
    if (stored && availableTargets.some((planet) => this.planetKey(planet) === stored)) {
      return stored;
    }

    const fallback = this.planetKey(availableTargets[0] ?? null);
    if (fallback) {
      this.supportTargetSelectionByPlayerId.set(contact.playerId, fallback);
    }
    return fallback;
  }

  protected setSelectedSupportTargetPlanet(contact: DiplomacyContactDto, planetKey: string): void {
    if (!this.availableSupportTargetPlanets(contact).some((planet) => this.planetKey(planet) === planetKey)) {
      return;
    }

    this.supportTargetSelectionByPlayerId.set(contact.playerId, planetKey);
  }

  protected canSendSupportRequest(contact: DiplomacyContactDto): boolean {
    if (this.activeContactActionPlayerId !== null || this.availableSupportTypes(contact).length <= 0) {
      return false;
    }

    if (!this.selectedSupportTargetPlanetKey(contact)) {
      return false;
    }

    if (this.supportNeedsOffensiveTarget(contact)) {
      return this.requestedSupportShips(contact).length > 0;
    }

    if (!this.supportNeedsResources(contact)) {
      return true;
    }

    return this.requestedSupportMetal(contact) > 0
      || this.requestedSupportCrystal(contact) > 0
      || this.requestedSupportDeuterium(contact) > 0;
  }

  protected requestedSupportMetal(contact: DiplomacyContactDto): number {
    return this.supportRequestedMetalByPlayerId[contact.playerId] ?? 0;
  }

  protected requestedSupportCrystal(contact: DiplomacyContactDto): number {
    return this.supportRequestedCrystalByPlayerId[contact.playerId] ?? 0;
  }

  protected requestedSupportDeuterium(contact: DiplomacyContactDto): number {
    return this.supportRequestedDeuteriumByPlayerId[contact.playerId] ?? 0;
  }

  protected updateRequestedSupportMetal(contact: DiplomacyContactDto, value: number | string): void {
    this.supportRequestedMetalByPlayerId[contact.playerId] = this.normalizeAmount(value);
  }

  protected updateRequestedSupportCrystal(contact: DiplomacyContactDto, value: number | string): void {
    this.supportRequestedCrystalByPlayerId[contact.playerId] = this.normalizeAmount(value);
  }

  protected updateRequestedSupportDeuterium(contact: DiplomacyContactDto, value: number | string): void {
    this.supportRequestedDeuteriumByPlayerId[contact.playerId] = this.normalizeAmount(value);
  }

  protected supportShipTypes(): string[] {
    return OFFENSIVE_SUPPORT_SHIP_TYPES;
  }

  protected requestedSupportShipAmount(contact: DiplomacyContactDto, shipType: string): number {
    return this.supportRequestedShipsByPlayerId[contact.playerId]?.[shipType] ?? 0;
  }

  protected updateRequestedSupportShipAmount(contact: DiplomacyContactDto, shipType: string, value: number | string): void {
    const current = this.supportRequestedShipsByPlayerId[contact.playerId] ?? {};
    current[shipType] = this.normalizeAmount(value);
    this.supportRequestedShipsByPlayerId[contact.playerId] = current;
  }

  protected requestedSupportShips(contact: DiplomacyContactDto): ShipAmountEntry[] {
    const current = this.supportRequestedShipsByPlayerId[contact.playerId] ?? {};
    return Object.entries(current)
      .map(([type, amount]) => ({ type, amount: amount ?? 0 } as ShipAmountEntry))
      .filter((entry) => entry.amount > 0);
  }

  protected supportUsesBombardmentPriorities(contact: DiplomacyContactDto): boolean {
    const supportType = this.selectedSupportType(contact);
    return supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET';
  }

  protected bombardmentPriorityOptions(): BombardmentPrioritySelection[] {
    return BOMBARDMENT_PRIORITY_OPTIONS;
  }

  protected selectedSupportBombardmentPriorities(contact: DiplomacyContactDto): BombardmentPriorities {
    return this.supportBombardmentPrioritiesByPlayerId.get(contact.playerId) ?? emptyBombardmentPriorities();
  }

  protected setSupportBombardmentPriority(
    contact: DiplomacyContactDto,
    slot: keyof BombardmentPriorities,
    value: string
  ): void {
    const current = {
      ...this.selectedSupportBombardmentPriorities(contact)
    };
    current[slot] = value ? value as BombardmentPrioritySelection : null;
    this.supportBombardmentPrioritiesByPlayerId.set(contact.playerId, current);
  }

  protected supportPriorityLabel(priority: BombardmentPrioritySelection): string {
    return bombardmentPriorityLabel(priority);
  }

  protected supportTargetPrompt(contact: DiplomacyContactDto): string {
    return this.supportNeedsFriendlyTarget(contact) ? 'Target own planet' : 'Requested hostile target';
  }

  protected supportTargetLabel(planet: ClientPlanetDto): string {
    const owner = planet.info.ownerPlayerName ? `${planet.info.ownerPlayerName} - ` : '';
    return `${owner}${planet.basicInfo.name} (${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z})`;
  }

  protected mailRecipients(): MailRecipientDto[] {
    return this.contacts
      .filter((contact) => contact.canSendMessage)
      .map((contact) => ({
        playerId: contact.playerId,
        playerName: contact.playerName,
        playerType: contact.playerType,
        currentStatus: contact.currentStatus,
        isAllianceMember: contact.currentStatus === DiplomaticStatus.ALLIED
      }));
  }

  protected contactStatusLabel(contact: DiplomacyContactDto): string {
    return `${contact.playerType} | ${contact.currentStatus}`;
  }

  protected contactMetaLabel(contact: DiplomacyContactDto): string {
    return `${contact.knownPlanets.length} known planet(s)`;
  }

  protected proposalCounterpartyLabel(proposal: DiplomaticProposalDto): string {
    return proposal.direction === 'incoming'
      ? `From ${proposal.fromPlayerName}`
      : `To ${proposal.toPlayerName}`;
  }

  protected isContactActionPending(contact: DiplomacyContactDto): boolean {
    return this.activeContactActionPlayerId === contact.playerId;
  }

  protected proposalMailActionLabel(proposal: DiplomaticProposalDto): string {
    return proposal.direction === 'incoming'
      ? 'Open Mail to answer'
      : 'Open Mail to review';
  }

  protected sendProposal(contact: DiplomacyContactDto): void {
    if (!contact.canSendProposal || this.activeContactActionPlayerId !== null) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    const requestedStatus = this.selectedProposalStatus(contact);
    this.activeContactActionPlayerId = contact.playerId;
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.createDiplomaticProposal(
      {
        targetPlayerId: contact.playerId,
        requestedStatus
      },
      session.token
    )
      .pipe(finalize(() => {
        this.activeContactActionPlayerId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.applyViewResponse(response);
        },
        error: (error) => {
          this.actionError = error?.error?.error ?? 'Unable to send diplomacy proposal.';
        }
      });
  }

  protected sendSupportRequest(contact: DiplomacyContactDto): void {
    if (!this.canSendSupportRequest(contact) || this.activeContactActionPlayerId !== null) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    const targetPlanet = this.availableSupportTargetPlanets(contact)
      .find((planet) => this.planetKey(planet) === this.selectedSupportTargetPlanetKey(contact));
    if (!targetPlanet) {
      this.actionError = 'Select a target planet for support.';
      return;
    }

    this.activeContactActionPlayerId = contact.playerId;
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.createSupportRequest(
      {
        targetPlayerId: contact.playerId,
        supportType: this.selectedSupportType(contact),
        targetCoordinates: targetPlanet.coordinates,
        requestedResources: this.supportNeedsResources(contact)
          ? {
            metal: this.requestedSupportMetal(contact),
            crystal: this.requestedSupportCrystal(contact),
            deuterium: this.requestedSupportDeuterium(contact)
          }
          : null,
        missionType: this.selectedSupportMissionType(contact),
        minimumShips: this.supportNeedsOffensiveTarget(contact) ? this.requestedSupportShips(contact) : null,
        bombardmentPriorities: this.supportUsesBombardmentPriorities(contact)
          ? this.selectedSupportBombardmentPriorities(contact)
          : null
      },
      session.token
    )
      .pipe(finalize(() => {
        this.activeContactActionPlayerId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.applyViewResponse(response);
          this.actionSuccess = 'Support request sent.';
        },
        error: (error) => {
          this.actionError = error?.error?.error ?? 'Unable to send support request.';
        }
      });
  }

  protected openMessageComposer(contact: DiplomacyContactDto | null): void {
    if (!contact?.canSendMessage) {
      return;
    }

    this.actionError = null;
    this.actionSuccess = null;
    this.composerLockedTargetPlayerId = contact.playerId;
    this.composerLockedTargetPlayerName = contact.playerName;
    this.composerOpen = true;
  }

  protected closeComposer(): void {
    this.composerOpen = false;
  }

  protected handleComposerSent(event: { deliveredCount: number }): void {
    this.actionSuccess = event.deliveredCount === 1
      ? `Message sent to ${this.composerLockedTargetPlayerName ?? 'recipient'}.`
      : `Message sent to ${event.deliveredCount} recipients.`;
  }

  private loadDiplomacyView(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.actionError = null;

    this.gameApi.getDiplomacyView(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.applyViewResponse(response);
        },
        error: (error) => {
          this.loadError = error?.error?.error ?? 'Unable to load diplomacy data.';
        }
      });
  }

  private applyViewResponse(response: DiplomacyViewResponse): void {
    const previousSelectedPlayerId = this.selectedPlayerId;
    this.contacts = [...response.contacts];
    this.activeProposals = [...response.activeProposals];
    this.ownedPlanets = [...response.ownedPlanets];
    this.currentPlayerId = response.currentPlayerId;
    this.currentTurn = response.currentTurn;
    this.outgoingProposalSentThisTurn = response.outgoingProposalSentThisTurn;
    this.syncProposalSelections();
    this.syncSupportSelections();

    if (previousSelectedPlayerId !== null && this.visibleContacts().some((contact) => contact.playerId === previousSelectedPlayerId)) {
      this.selectedPlayerId = previousSelectedPlayerId;
      this.openTutorialAfterRender();
      return;
    }

    this.ensureVisibleSelection();
    this.openTutorialAfterRender();
  }

  private syncProposalSelections(): void {
    const validPlayerIds = new Set(this.contacts.map((contact) => contact.playerId));
    for (const playerId of [...this.proposalSelectionByPlayerId.keys()]) {
      if (!validPlayerIds.has(playerId)) {
        this.proposalSelectionByPlayerId.delete(playerId);
      }
    }

    for (const contact of this.contacts) {
      const current = this.proposalSelectionByPlayerId.get(contact.playerId);
      if (current && this.availableProposalStatuses(contact).includes(current)) {
        continue;
      }

      const fallback = this.availableProposalStatuses(contact)[0];
      if (fallback) {
        this.proposalSelectionByPlayerId.set(contact.playerId, fallback);
      } else {
        this.proposalSelectionByPlayerId.delete(contact.playerId);
      }
    }
  }

  private syncSupportSelections(): void {
    const validPlayerIds = new Set(this.contacts.map((contact) => contact.playerId));
    for (const playerId of [...this.supportTypeSelectionByPlayerId.keys()]) {
      if (!validPlayerIds.has(playerId)) {
        this.supportTypeSelectionByPlayerId.delete(playerId);
        this.supportTargetSelectionByPlayerId.delete(playerId);
        this.supportBombardmentPrioritiesByPlayerId.delete(playerId);
        delete this.supportRequestedMetalByPlayerId[playerId];
        delete this.supportRequestedCrystalByPlayerId[playerId];
        delete this.supportRequestedDeuteriumByPlayerId[playerId];
        delete this.supportRequestedShipsByPlayerId[playerId];
      }
    }

    for (const contact of this.contacts) {
      const currentType = this.supportTypeSelectionByPlayerId.get(contact.playerId);
      if (!currentType || !this.availableSupportTypes(contact).includes(currentType)) {
        const fallbackType = this.availableSupportTypes(contact)[0];
        if (fallbackType) {
          this.supportTypeSelectionByPlayerId.set(contact.playerId, fallbackType);
        } else {
          this.supportTypeSelectionByPlayerId.delete(contact.playerId);
        }
      }

      const currentTarget = this.supportTargetSelectionByPlayerId.get(contact.playerId);
      const availableTargets = this.availableSupportTargetPlanets(contact);
      if (!currentTarget || !availableTargets.some((planet) => this.planetKey(planet) === currentTarget)) {
        const fallbackTarget = this.planetKey(availableTargets[0] ?? null);
        if (fallbackTarget) {
          this.supportTargetSelectionByPlayerId.set(contact.playerId, fallbackTarget);
        } else {
          this.supportTargetSelectionByPlayerId.delete(contact.playerId);
        }
      }

      if (!this.supportBombardmentPrioritiesByPlayerId.has(contact.playerId)) {
        this.supportBombardmentPrioritiesByPlayerId.set(contact.playerId, emptyBombardmentPriorities());
      }
    }
  }

  private openTutorialAfterRender(): void {
    setTimeout(() => {
      this.cdr.detectChanges();
      this.tutorialService.autoOpenTutorial('diplomacyView');
    });
  }

  private ensureVisibleSelection(): void {
    const visibleContacts = this.visibleContacts();
    if (this.selectedPlayerId !== null && visibleContacts.some((contact) => contact.playerId === this.selectedPlayerId)) {
      return;
    }

    this.selectedPlayerId = visibleContacts[0]?.playerId ?? null;
  }

  private planetKey(planet: ClientPlanetDto | null): string {
    return planet ? `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}` : '';
  }

  private isContactValidOffensiveTarget(contact: DiplomacyContactDto, supportType: SupportRequestType): boolean {
    if (supportType === 'ATTACK_TARGET') {
      return contact.currentStatus === DiplomaticStatus.WAR
        || contact.currentStatus === DiplomaticStatus.NEUTRAL
        || contact.currentStatus === DiplomaticStatus.PASSIVE;
    }

    if (supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET') {
      return contact.currentStatus === DiplomaticStatus.WAR;
    }

    return false;
  }

  private selectedSupportMissionType(contact: DiplomacyContactDto): FleetMissionType | null {
    switch (this.selectedSupportType(contact)) {
      case 'ATTACK_TARGET':
        return FleetMissionType.ATTACK;
      case 'BOMBARD_TARGET':
        return FleetMissionType.BOMBARD;
      case 'SIEGE_TARGET':
        return FleetMissionType.SIEGE;
      default:
        return null;
    }
  }

  private normalizeAmount(value: number | string): number {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0;
  }

}
