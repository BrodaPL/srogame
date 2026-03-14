import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { TechnologyBlueprintsFactory } from '../../factories/technology-blueprints.factory';
import { Building } from '../../models/buildings/building';
import { BuildingRequirement } from '../../models/buildings/building-requirement';
import { BuildingType } from '../../models/enums/building-type';
import { TechnologyType } from '../../models/enums/technology-type';
import type {
  BuildingLevelEntry,
  BuildingPowerConsumptionEntry,
  ClientCoordinates,
  ClientPlanetDto,
  StartTechnologyResearchRequest,
  TechnologyQueueEntryDto
} from '../../models/game-api-types';
import { energyDeficitEfficiencyMultiplier } from '../../models/planets/energy-deficit';
import { ResourcesPack } from '../../models/resources-pack';
import { TechRequirement } from '../../models/tech/tech-requirement';
import { Technology } from '../../models/tech/technology';
import { researchPowerMultiplier } from '../../models/tech/technology-effects';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';

type EnergyState = {
  used: number;
  available: number;
};

type ResearchLabVm = {
  id: string;
  planet: ClientPlanetDto;
  labLevel: number;
  researchPower: number;
  label: string;
  isBusy: boolean;
};

type ResearchCostRowVm = {
  label: string;
  amount: number;
  isEnough: boolean;
};

type ResearchRequirementRowVm = {
  label: string;
  isMet: boolean;
  isPlaceholder: boolean;
};

type ResearchQueueRowVm = {
  position: number;
  planetLabel: string;
  technologyType: TechnologyType;
  fromLevel: number;
  toLevel: number;
  helperLabsCount: number;
  status: 'Researching';
  investedResearchPower: number;
  baseTotalResearchTime: number;
  estimatedTurnsForCompletion: number | null;
};

@Component({
  selector: 'app-researches-view',
  imports: [TopMenuComponent, MiniPlanetPreviewComponent, FormsModule],
  templateUrl: './researches-view.component.html'
})
export class ResearchesViewComponent implements OnInit {
  protected isLoading = false;
  protected loadError: string | null = null;
  protected startResearchError: string | null = null;
  protected allOwnedPlanetsWithResearchLab: ClientPlanetDto[] = [];
  protected freeResearchLabs: ResearchLabVm[] = [];
  protected maxLabsPerTechnology = 1;
  protected labSlotIndexes: number[] = [0];
  protected readonly technologies: Technology[];

  private readonly buildingBlueprintsByType: Map<BuildingType, Building>;
  private allOwnedPlanets: ClientPlanetDto[] = [];
  private readonly allOwnedPlanetsById = new Map<string, ClientPlanetDto>();
  private readonly allResearchLabsById = new Map<string, ResearchLabVm>();
  private readonly selectedLabsByTechnology = new Map<TechnologyType, Array<string | null>>();
  private readonly researchStartInFlightByType = new Set<TechnologyType>();
  private techLevelsByType = new Map<TechnologyType, number>();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();
    this.buildingBlueprintsByType = new Map(buildingBlueprints.buildingsMap);

    const technologiesBlueprints = TechnologyBlueprintsFactory.fromDefaultJson();
    this.technologies = Array.from(technologiesBlueprints.techByType.values());
  }

  public ngOnInit(): void {
    this.loadResearchesData();
  }

  protected researchLabSummaryLabel(planet: ClientPlanetDto): string {
    const lab = this.allResearchLabsById.get(this.planetId(planet));
    if (!lab) {
      return 'Research Lab not available.';
    }

    let stateLabel = 'FREE';
    if (planet.objects.currentResearchQueue) {
      stateLabel = `RESEARCHING ${planet.objects.currentResearchQueue.technologyType}`;
    } else if (planet.objects.researchHelperFor) {
      const helper = planet.objects.researchHelperFor;
      const target = helper.mainResearchCoordinates;
      stateLabel = `HELPING ${helper.technologyType} @ ${target.x}:${target.y}:${target.z}`;
    }

    return `Research Lab L${lab.labLevel} | Power ${lab.researchPower} | ${stateLabel}`;
  }

  protected currentTechnologyLevel(technologyType: TechnologyType): number {
    return this.techLevelsByType.get(technologyType) ?? 0;
  }

  protected technologyTargetLevel(technologyType: TechnologyType): number {
    return this.currentTechnologyLevel(technologyType) + 1;
  }

  protected technologyEnergyRequiredForTargetLevel(technology: Technology): number {
    return this.technologyEnergyRequired(technology, this.technologyTargetLevel(technology.type));
  }

  protected technologyResearchTimeForTargetLevel(technology: Technology): number {
    const targetLevel = this.technologyTargetLevel(technology.type);
    const index = targetLevel - 1;
    const direct = technology.researchTime[index];
    if (Number.isFinite(direct)) {
      return direct;
    }

    const fallback = technology.researchTime[technology.researchTime.length - 1] ?? 0;
    return Number.isFinite(fallback) ? fallback : 0;
  }

  protected technologyCostRows(technology: Technology): ResearchCostRowVm[] {
    const targetLevel = this.technologyTargetLevel(technology.type);
    const cost = technology.getCostForLevel(targetLevel);
    const firstLab = this.firstAssignedLab(technology.type);
    const resources = firstLab?.planet.objects.resources;

    return [
      {
        label: 'Metal',
        amount: cost.metal,
        isEnough: resources ? resources.metal >= cost.metal : true
      },
      {
        label: 'Crystal',
        amount: cost.crystal,
        isEnough: resources ? resources.crystal >= cost.crystal : true
      },
      {
        label: 'Deuterium',
        amount: cost.deuterium,
        isEnough: resources ? resources.deuterium >= cost.deuterium : true
      }
    ];
  }

  protected technologyRequirementRows(technology: Technology): ResearchRequirementRowVm[] {
    const targetLevel = this.technologyTargetLevel(technology.type);
    const firstLab = this.firstAssignedLab(technology.type);
    const rows: ResearchRequirementRowVm[] = [];

    for (const requirement of technology.buildingRequirements) {
      const requiredLevel = Math.ceil(targetLevel * requirement.level);
      const currentLevel = firstLab ? this.buildingLevel(firstLab.planet, requirement.building) : 0;
      rows.push({
        label: `B ${requirement.building}: ${currentLevel}/${requiredLevel}`,
        isMet: firstLab ? currentLevel >= requiredLevel : false,
        isPlaceholder: false
      });
    }

    for (const requirement of technology.techRequirements) {
      const requiredLevel = Math.ceil(targetLevel * requirement.level);
      const currentLevel = this.currentTechnologyLevel(requirement.tech);
      rows.push({
        label: `T ${requirement.tech}: ${currentLevel}/${requiredLevel}`,
        isMet: currentLevel >= requiredLevel,
        isPlaceholder: false
      });
    }

    if (rows.length === 0) {
      return [
        {
          label: 'None',
          isMet: true,
          isPlaceholder: true
        }
      ];
    }

    return rows;
  }

  protected selectedLabId(technologyType: TechnologyType, slotIndex: number): string | null {
    return this.selectionArray(technologyType)[slotIndex] ?? null;
  }

  protected labOptionsForSlot(technologyType: TechnologyType, slotIndex: number): ResearchLabVm[] {
    const selectedId = this.selectedLabId(technologyType, slotIndex);
    const selectedLab = selectedId ? (this.allResearchLabsById.get(selectedId) ?? null) : null;
    if (this.isLabDropdownDisabled(technologyType, slotIndex)) {
      return selectedLab ? [selectedLab] : [];
    }

    const assignedElsewhere = this.assignedLabIdsExcluding(technologyType, slotIndex);
    const options = this.freeResearchLabs.filter((lab) => !assignedElsewhere.has(lab.id));
    if (!selectedLab) {
      return options;
    }

    const alreadyIncluded = options.some((entry) => entry.id === selectedLab.id);
    if (alreadyIncluded) {
      return options;
    }

    return [selectedLab, ...options];
  }

  protected isLabDropdownDisabled(technologyType: TechnologyType, slotIndex: number): boolean {
    if (slotIndex === 0 && this.isTechnologyQueued(technologyType)) {
      return true;
    }

    if (this.freeResearchLabs.length === 0) {
      return true;
    }

    if (slotIndex === 0) {
      return false;
    }

    return this.selectedLabId(technologyType, slotIndex - 1) === null;
  }

  protected onLabSelectionChange(
    technologyType: TechnologyType,
    slotIndex: number,
    rawValue: unknown
  ): void {
    const normalized = typeof rawValue === 'string' && rawValue.trim().length > 0
      ? rawValue.trim()
      : null;
    const selected = this.selectionArray(technologyType);

    selected[slotIndex] = normalized;
    for (let index = slotIndex + 1; index < selected.length; index += 1) {
      selected[index] = null;
    }

    if (normalized) {
      this.clearDuplicateLabAssignment(normalized, technologyType, slotIndex);
    }

    this.sanitizeLabSelections();
  }

  protected canStartResearch(technology: Technology): boolean {
    if (this.researchStartInFlightByType.has(technology.type)) {
      return false;
    }

    if (this.isTechnologyQueued(technology.type)) {
      return false;
    }

    const firstLab = this.firstAssignedLab(technology.type);
    if (!firstLab) {
      return false;
    }

    if (firstLab.isBusy) {
      return false;
    }

    if (firstLab.planet.objects.currentResearchQueue || firstLab.planet.objects.researchHelperFor) {
      return false;
    }

    const targetLevel = this.technologyTargetLevel(technology.type);
    const cost = technology.getCostForLevel(targetLevel);
    if (!this.hasEnoughResources(firstLab.planet, cost)) {
      return false;
    }

    if (!this.hasEnoughEnergy(firstLab.planet, technology, targetLevel)) {
      return false;
    }

    if (!this.hasBuildingRequirements(firstLab.planet, technology.buildingRequirements, targetLevel)) {
      return false;
    }

    if (!this.hasTechRequirements(technology.techRequirements, targetLevel)) {
      return false;
    }

    return true;
  }

  protected researchButtonLabel(technology: Technology): string {
    if (this.researchStartInFlightByType.has(technology.type)) {
      return 'Researching';
    }

    if (this.isTechnologyQueued(technology.type)) {
      return 'Researching';
    }

    const firstLab = this.firstAssignedLab(technology.type);
    if (!firstLab) {
      return 'START RESEARCH';
    }

    if (firstLab.planet.objects.currentResearchQueue) {
      return firstLab.planet.objects.currentResearchQueue.technologyType === technology.type
        ? 'Researching'
        : 'Queued';
    }

    if (firstLab.planet.objects.researchHelperFor) {
      return 'Queued';
    }

    return 'START RESEARCH';
  }

  protected researchButtonTitle(technology: Technology): string {
    if (this.researchStartInFlightByType.has(technology.type)) {
      return 'Starting research...';
    }

    if (this.isTechnologyQueued(technology.type)) {
      return 'Technology is already being researched.';
    }

    return this.canStartResearch(technology)
      ? 'Start research and add technology to queue.'
      : 'Select first free Research Lab and meet conditions to unlock.';
  }

  protected onStartResearch(technology: Technology): void {
    if (!this.canStartResearch(technology)) {
      return;
    }

    const session = this.playerSession.load();
    const firstLab = this.firstAssignedLab(technology.type);
    if (!session || !firstLab) {
      return;
    }

    const helperPlanets = this.selectedHelperCoordinates(technology.type);
    const request: StartTechnologyResearchRequest = {
      x: firstLab.planet.coordinates.x,
      y: firstLab.planet.coordinates.y,
      z: firstLab.planet.coordinates.z,
      technologyType: technology.type,
      helperPlanets
    };

    this.researchStartInFlightByType.add(technology.type);
    this.startResearchError = null;
    this.cdr.markForCheck();

    this.gameApi.startTechnologyResearch(request, session.token)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.researchStartInFlightByType.delete(technology.type);
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (ownedPlanets) => {
          this.applyOwnedPlanets(ownedPlanets);
          this.cdr.markForCheck();
        },
        error: (error: { error?: { error?: string } }) => {
          this.startResearchError = error?.error?.error ?? 'Unable to add technology to queue.';
          this.cdr.markForCheck();
        }
      });
  }

  protected hasResearchQueueEntries(): boolean {
    return this.researchQueueRows().length > 0;
  }

  protected researchQueueRows(): ResearchQueueRowVm[] {
    const rows: ResearchQueueRowVm[] = [];
    let position = 1;
    for (const planet of this.allOwnedPlanets) {
      const queue = planet.objects.currentResearchQueue;
      if (!queue) {
        continue;
      }

      const technologyType = this.queueEntryTechnologyType(queue);
      const toLevel = this.queueEntryNextLevel(queue);
      const investedResearchPower = this.queueEntryInvestedResearchPower(queue);
      const helperLabs = this.queueEntryHelperLabs(queue);
      const baseTotalResearchTime = this.baseResearchTime(technologyType, toLevel);
      const remaining = Math.max(0, baseTotalResearchTime - investedResearchPower);
      const researchPower = this.researchQueuePower(planet, technologyType, helperLabs);
      const estimatedTurnsForCompletion = researchPower > 0
        ? Math.ceil(remaining / researchPower)
        : null;

      rows.push({
        position,
        planetLabel: `${planet.basicInfo.name} [${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}]`,
        technologyType,
        fromLevel: Math.max(0, toLevel - 1),
        toLevel,
        helperLabsCount: helperLabs.length,
        status: 'Researching',
        investedResearchPower,
        baseTotalResearchTime,
        estimatedTurnsForCompletion
      });
      position += 1;
    }

    return rows;
  }

  private loadResearchesData(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found. Start a new game.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.startResearchError = null;

    this.gameApi.getOwnedPlanets(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (ownedPlanets) => {
          this.applyOwnedPlanets(ownedPlanets);
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Unable to load owned planets from server.';
          this.cdr.markForCheck();
        }
      });
  }

  private applyOwnedPlanets(ownedPlanets: ClientPlanetDto[]): void {
    const sorted = [...ownedPlanets].sort((left, right) => this.comparePlanetCoordinates(left, right));
    this.allOwnedPlanets = sorted;
    this.allOwnedPlanetsById.clear();
    for (const planet of sorted) {
      this.allOwnedPlanetsById.set(this.planetId(planet), planet);
    }

    this.techLevelsByType = this.buildTechLevelsMap(sorted);

    const planetsWithResearchLab = sorted.filter((planet) => this.buildingLevel(planet, BuildingType.RESEARCH_LAB) > 0);
    this.allOwnedPlanetsWithResearchLab = planetsWithResearchLab;

    const allResearchLabs = planetsWithResearchLab.map((planet) => this.toResearchLabVm(planet));
    this.allResearchLabsById.clear();
    for (const lab of allResearchLabs) {
      this.allResearchLabsById.set(lab.id, lab);
    }

    this.freeResearchLabs = allResearchLabs
      .filter((lab) => !lab.isBusy)
      .sort((left, right) => left.label.localeCompare(right.label));

    this.maxLabsPerTechnology = this.calculateMaxLabsPerTechnology();
    this.labSlotIndexes = Array.from({ length: this.maxLabsPerTechnology }, (_, index) => index);
    this.rebuildLabSelections();
  }

  private toResearchLabVm(planet: ClientPlanetDto): ResearchLabVm {
    const labLevel = this.buildingLevel(planet, BuildingType.RESEARCH_LAB);
    const researchPower = this.researchPower(planet, labLevel);
    const id = this.planetId(planet);

    return {
      id,
      planet,
      labLevel,
      researchPower,
      label: `${planet.basicInfo.name} L${labLevel} (${researchPower})`,
      isBusy: planet.objects.currentResearchQueue !== null || planet.objects.researchHelperFor !== null
    };
  }

  private researchPower(planet: ClientPlanetDto, researchLabLevel: number): number {
    const basePower = this.buildingProductionValue(planet, BuildingType.RESEARCH_LAB, researchLabLevel);
    const computerLevel = this.currentTechnologyLevel(TechnologyType.COMPUTER_TECHNOLOGY);
    const adaptiveLevel = this.currentTechnologyLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
    const irnLevel = this.currentTechnologyLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK);
    const scienceModifier = planet.info.planetaryParameters.scienceModifier;
    const energyState = this.calculateEnergyState(planet);
    const result = basePower
      * researchPowerMultiplier(computerLevel, adaptiveLevel, irnLevel)
      * scienceModifier
      * energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);
    return Number.isFinite(result) ? Math.floor(result) : 0;
  }

  private calculateMaxLabsPerTechnology(): number {
    const irnLevel = this.currentTechnologyLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK);
    const formulaResult = Math.floor((1.5 * Math.sqrt(irnLevel)) + 1);
    return Math.max(1, formulaResult);
  }

  private rebuildLabSelections(): void {
    const next = new Map<TechnologyType, Array<string | null>>();
    for (const technology of this.technologies) {
      const existing = this.selectedLabsByTechnology.get(technology.type) ?? [];
      const resized = Array.from(
        { length: this.maxLabsPerTechnology },
        (_, index) => existing[index] ?? null
      );

      const queued = this.queuedResearchForTechnology(technology.type);
      if (queued) {
        resized[0] = this.planetId(queued.planet);
        const helperIds = this.queuedHelperLabIds(queued.queue);
        for (let slotIndex = 1; slotIndex < resized.length; slotIndex += 1) {
          resized[slotIndex] = helperIds[slotIndex - 1] ?? null;
        }
      }

      next.set(technology.type, resized);
    }

    this.selectedLabsByTechnology.clear();
    for (const [technologyType, selection] of next.entries()) {
      this.selectedLabsByTechnology.set(technologyType, selection);
    }

    this.sanitizeLabSelections();
  }

  private sanitizeLabSelections(): void {
    const freeLabIds = new Set(this.freeResearchLabs.map((lab) => lab.id));
    const globallyAssigned = new Set<string>();
    const lockedMainLabByTechnology = new Map<TechnologyType, string>();
    const queuedHelperLabIdsByTechnology = new Map<TechnologyType, Set<string>>();
    for (const technology of this.technologies) {
      const queued = this.queuedResearchForTechnology(technology.type);
      if (!queued) {
        continue;
      }

      lockedMainLabByTechnology.set(technology.type, this.planetId(queued.planet));
      queuedHelperLabIdsByTechnology.set(
        technology.type,
        new Set(this.queuedHelperLabIds(queued.queue))
      );
    }

    for (const technology of this.technologies) {
      const selection = this.selectionArray(technology.type);
      const lockedMainLabId = lockedMainLabByTechnology.get(technology.type) ?? null;
      if (lockedMainLabId) {
        selection[0] = lockedMainLabId;
      }

      const queuedHelperIds = queuedHelperLabIdsByTechnology.get(technology.type) ?? new Set<string>();
      for (let slotIndex = 0; slotIndex < selection.length; slotIndex += 1) {
        const previousSelected = slotIndex === 0 || selection[slotIndex - 1] !== null;
        const selectedLabId = selection[slotIndex];
        if (!previousSelected || !selectedLabId) {
          selection[slotIndex] = null;
          continue;
        }

        const isLockedMain = slotIndex === 0 && lockedMainLabId === selectedLabId;
        const isQueuedHelper = slotIndex > 0 && queuedHelperIds.has(selectedLabId);
        const isSelectable = freeLabIds.has(selectedLabId) || isLockedMain || isQueuedHelper;
        if (!isSelectable || globallyAssigned.has(selectedLabId)) {
          selection[slotIndex] = null;
          continue;
        }

        globallyAssigned.add(selectedLabId);
      }
    }
  }

  private clearDuplicateLabAssignment(
    selectedLabId: string,
    keepTechnologyType: TechnologyType,
    keepSlotIndex: number
  ): void {
    for (const technology of this.technologies) {
      const selection = this.selectionArray(technology.type);
      for (let slotIndex = 0; slotIndex < selection.length; slotIndex += 1) {
        const shouldKeep = technology.type === keepTechnologyType && slotIndex === keepSlotIndex;
        if (shouldKeep) {
          continue;
        }

        if (selection[slotIndex] === selectedLabId) {
          selection[slotIndex] = null;
        }
      }
    }
  }

  private assignedLabIdsExcluding(technologyType: TechnologyType, slotIndex: number): Set<string> {
    const assigned = new Set<string>();
    for (const technology of this.technologies) {
      const selection = this.selectionArray(technology.type);
      for (let index = 0; index < selection.length; index += 1) {
        const selectedLabId = selection[index];
        if (!selectedLabId) {
          continue;
        }

        if (technology.type === technologyType && index === slotIndex) {
          continue;
        }

        assigned.add(selectedLabId);
      }
    }

    return assigned;
  }

  private firstAssignedLab(technologyType: TechnologyType): ResearchLabVm | null {
    const firstLabId = this.selectedLabId(technologyType, 0);
    if (!firstLabId) {
      return null;
    }

    return this.allResearchLabsById.get(firstLabId) ?? null;
  }

  private isTechnologyQueued(technologyType: TechnologyType): boolean {
    return this.queuedResearchForTechnology(technologyType) !== null;
  }

  private queuedResearchForTechnology(
    technologyType: TechnologyType
  ): { planet: ClientPlanetDto; queue: TechnologyQueueEntryDto } | null {
    for (const planet of this.allOwnedPlanets) {
      const queue = planet.objects.currentResearchQueue;
      if (!queue) {
        continue;
      }

      if (this.queueEntryTechnologyType(queue) === technologyType) {
        return { planet, queue };
      }
    }

    return null;
  }

  private queuedHelperLabIds(queue: TechnologyQueueEntryDto): string[] {
    const ids: string[] = [];
    for (const helperCoordinates of this.queueEntryHelperLabs(queue)) {
      ids.push(`${helperCoordinates.x}:${helperCoordinates.y}:${helperCoordinates.z}`);
    }

    return ids;
  }

  private selectedHelperCoordinates(technologyType: TechnologyType): ClientCoordinates[] {
    const selection = this.selectionArray(technologyType);
    const helperCoordinates: ClientCoordinates[] = [];
    const ids = new Set<string>();
    for (let slotIndex = 1; slotIndex < selection.length; slotIndex += 1) {
      const helperLabId = selection[slotIndex];
      if (!helperLabId || ids.has(helperLabId)) {
        continue;
      }

      const helperLab = this.allResearchLabsById.get(helperLabId);
      if (!helperLab) {
        continue;
      }

      ids.add(helperLabId);
      helperCoordinates.push({
        x: helperLab.planet.coordinates.x,
        y: helperLab.planet.coordinates.y,
        z: helperLab.planet.coordinates.z
      });
    }

    return helperCoordinates;
  }

  private queueEntryTechnologyType(entry: TechnologyQueueEntryDto): TechnologyType {
    return entry.technologyType as TechnologyType;
  }

  private queueEntryNextLevel(entry: TechnologyQueueEntryDto): number {
    const parsed = Number(entry.nextLevel);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }

    return Math.max(1, Math.floor(parsed));
  }

  private queueEntryInvestedResearchPower(entry: TechnologyQueueEntryDto): number {
    const parsed = Number(entry.investedResearchPower);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  private queueEntryHelperLabs(entry: TechnologyQueueEntryDto): ClientCoordinates[] {
    if (!Array.isArray(entry.helperLabs)) {
      return [];
    }

    const uniqueIds = new Set<string>();
    const result: ClientCoordinates[] = [];
    for (const helper of entry.helperLabs) {
      if (!helper || !Number.isInteger(helper.x) || !Number.isInteger(helper.y) || !Number.isInteger(helper.z)) {
        continue;
      }

      if (helper.x < 0 || helper.y < 0 || helper.z < 0) {
        continue;
      }

      const id = `${helper.x}:${helper.y}:${helper.z}`;
      if (uniqueIds.has(id)) {
        continue;
      }

      uniqueIds.add(id);
      result.push({ x: helper.x, y: helper.y, z: helper.z });
    }

    return result;
  }

  private baseResearchTime(technologyType: TechnologyType, toLevel: number): number {
    const technology = this.technologies.find((entry) => entry.type === technologyType);
    if (!technology) {
      return 0;
    }

    const cost = technology.getCostForLevel(toLevel);
    const total = cost.getTotalResourceAmount();
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }

    return Math.floor(total);
  }

  private researchQueuePower(
    starterPlanet: ClientPlanetDto,
    technologyType: TechnologyType,
    helperLabs: ClientCoordinates[]
  ): number {
    let total = this.researchPower(
      starterPlanet,
      this.buildingLevel(starterPlanet, BuildingType.RESEARCH_LAB)
    );

    for (const helperCoordinates of helperLabs) {
      const helperPlanet = this.allOwnedPlanetsById.get(
        `${helperCoordinates.x}:${helperCoordinates.y}:${helperCoordinates.z}`
      );
      if (!helperPlanet) {
        continue;
      }

      const helperReference = helperPlanet.objects.researchHelperFor;
      if (!helperReference || helperReference.technologyType !== technologyType) {
        continue;
      }

      const target = helperReference.mainResearchCoordinates;
      if (
        target.x !== starterPlanet.coordinates.x
        || target.y !== starterPlanet.coordinates.y
        || target.z !== starterPlanet.coordinates.z
      ) {
        continue;
      }

      const helperLevel = this.buildingLevel(helperPlanet, BuildingType.RESEARCH_LAB);
      total += this.researchPower(helperPlanet, helperLevel);
    }

    return Math.max(0, Math.floor(total));
  }

  private selectionArray(technologyType: TechnologyType): Array<string | null> {
    const existing = this.selectedLabsByTechnology.get(technologyType);
    if (existing) {
      return existing;
    }

    const initialized = Array.from({ length: this.maxLabsPerTechnology }, () => null);
    this.selectedLabsByTechnology.set(technologyType, initialized);
    return initialized;
  }

  private buildTechLevelsMap(planets: ClientPlanetDto[]): Map<TechnologyType, number> {
    const map = new Map<TechnologyType, number>();
    for (const planet of planets) {
      for (const entry of planet.reportData?.techLevels ?? []) {
        const techType = entry.type as TechnologyType;
        const previous = map.get(techType) ?? 0;
        if (entry.level > previous) {
          map.set(techType, entry.level);
        }
      }
    }

    return map;
  }

  private hasEnoughResources(planet: ClientPlanetDto, required: ResourcesPack): boolean {
    const resources = planet.objects.resources;
    return (
      resources.metal >= required.metal
      && resources.crystal >= required.crystal
      && resources.deuterium >= required.deuterium
    );
  }

  private hasEnoughEnergy(planet: ClientPlanetDto, technology: Technology, targetLevel: number): boolean {
    const energyRequired = this.technologyEnergyRequired(technology, targetLevel);
    if (energyRequired <= 0) {
      return true;
    }

    const energyState = this.calculateEnergyState(planet);
    return (energyState.available - energyState.used) >= energyRequired;
  }

  private hasBuildingRequirements(
    planet: ClientPlanetDto,
    requirements: BuildingRequirement[],
    targetTechnologyLevel: number
  ): boolean {
    for (const requirement of requirements) {
      const requiredLevel = Math.ceil(targetTechnologyLevel * requirement.level);
      const currentLevel = this.buildingLevel(planet, requirement.building);
      if (currentLevel < requiredLevel) {
        return false;
      }
    }

    return true;
  }

  private hasTechRequirements(requirements: TechRequirement[], targetTechnologyLevel: number): boolean {
    for (const requirement of requirements) {
      const requiredLevel = Math.ceil(targetTechnologyLevel * requirement.level);
      const currentLevel = this.currentTechnologyLevel(requirement.tech);
      if (currentLevel < requiredLevel) {
        return false;
      }
    }

    return true;
  }

  private technologyEnergyRequired(technology: Technology, targetLevel: number): number {
    const index = targetLevel - 1;
    const direct = technology.energyRequired[index];
    if (Number.isFinite(direct)) {
      return Math.max(0, Math.floor(direct));
    }

    const fallback = technology.energyRequired[technology.energyRequired.length - 1] ?? 0;
    return Number.isFinite(fallback) ? Math.max(0, Math.floor(fallback)) : 0;
  }

  private calculateEnergyState(planet: ClientPlanetDto): EnergyState {
    const solarProduction = this.buildingProductionValue(
      planet,
      BuildingType.SOLAR_WIND_GEOTHERMAL,
      this.buildingLevel(planet, BuildingType.SOLAR_WIND_GEOTHERMAL)
    );
    const nuclearProduction = this.buildingProductionValue(
      planet,
      BuildingType.NUCLEAR_PLANT,
      this.buildingLevel(planet, BuildingType.NUCLEAR_PLANT)
    );
    const fusionProduction = this.buildingProductionValue(
      planet,
      BuildingType.FUSION_REACTOR,
      this.buildingLevel(planet, BuildingType.FUSION_REACTOR)
    );

    const energyModifierRES = planet.info.planetaryParameters.energyModifierRES;
    const energyModifierNuclear = planet.info.planetaryParameters.energyModifierNuclear;
    const energyTechLevel = this.currentTechnologyLevel(TechnologyType.ENERGY_TECHNOLOGY);

    const availableEnergy = (
      (solarProduction * energyModifierRES)
      + (nuclearProduction * energyModifierNuclear)
      + fusionProduction
    ) * (1 + ((energyTechLevel * 2) / 100));

    let usedEnergy = 0;
    for (const entry of planet.objects.buildingsLevels) {
      const buildingType = entry.type as BuildingType;
      const level = entry.level;
      if (level <= 0) {
        continue;
      }

      const blueprint = this.buildingBlueprintsByType.get(buildingType);
      if (!blueprint) {
        continue;
      }

      const powerPerLevel = blueprint.powerConsumption ?? 0;
      if (powerPerLevel <= 0) {
        continue;
      }

      const maxConsumption = Math.max(0, level * powerPerLevel);
      const current = this.currentPowerConsumption(planet, buildingType);
      usedEnergy += Math.min(maxConsumption, Math.max(0, current));
    }

    return {
      used: usedEnergy,
      available: availableEnergy
    };
  }

  private buildingProductionValue(
    planet: ClientPlanetDto,
    buildingType: BuildingType,
    level: number
  ): number {
    if (level <= 0) {
      return 0;
    }

    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    if (!blueprint) {
      return 0;
    }

    const raw = blueprint.production1[level - 1];
    if (!Number.isFinite(raw)) {
      return 0;
    }

    const powerPerLevel = blueprint.powerConsumption ?? 0;
    if (powerPerLevel <= 0) {
      return Math.floor(raw);
    }

    const maxConsumption = Math.max(0, level * powerPerLevel);
    if (maxConsumption <= 0) {
      return Math.floor(raw);
    }

    const currentConsumption = this.currentPowerConsumption(planet, buildingType);
    const utilization = Math.min(maxConsumption, Math.max(0, currentConsumption)) / maxConsumption;
    return Math.floor(raw * utilization);
  }

  private currentPowerConsumption(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const level = this.buildingLevel(planet, buildingType);
    if (level <= 0) {
      return 0;
    }

    const blueprint = this.buildingBlueprintsByType.get(buildingType);
    const powerPerLevel = blueprint?.powerConsumption ?? 0;
    const maxConsumption = Math.max(0, level * powerPerLevel);
    if (maxConsumption <= 0) {
      return 0;
    }

    const entry = this.findPowerConsumptionEntry(planet.objects.buildingsCurrentPowerConsumption, buildingType);
    if (!entry) {
      return maxConsumption;
    }

    return Math.min(maxConsumption, Math.max(0, entry.currentPowerConsumption));
  }

  private buildingLevel(planet: ClientPlanetDto, buildingType: BuildingType): number {
    const entry = this.findBuildingLevelEntry(planet.objects.buildingsLevels, buildingType);
    return entry?.level ?? 0;
  }

  private findBuildingLevelEntry(
    entries: BuildingLevelEntry[],
    buildingType: BuildingType
  ): BuildingLevelEntry | null {
    for (const entry of entries) {
      if ((entry.type as BuildingType) === buildingType) {
        return entry;
      }
    }

    return null;
  }

  private findPowerConsumptionEntry(
    entries: BuildingPowerConsumptionEntry[],
    buildingType: BuildingType
  ): BuildingPowerConsumptionEntry | null {
    for (const entry of entries) {
      if ((entry.type as BuildingType) === buildingType) {
        return entry;
      }
    }

    return null;
  }

  private planetId(planet: ClientPlanetDto): string {
    return `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}`;
  }

  private comparePlanetCoordinates(left: ClientPlanetDto, right: ClientPlanetDto): number {
    if (left.coordinates.y !== right.coordinates.y) {
      return left.coordinates.y - right.coordinates.y;
    }

    if (left.coordinates.x !== right.coordinates.x) {
      return left.coordinates.x - right.coordinates.x;
    }

    return left.coordinates.z - right.coordinates.z;
  }
}
