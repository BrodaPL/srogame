export const TUTORIAL_VIEW_KEYS = [
  'galacticView',
  'imperiumView',
  'planetView',
  'buildingsView',
  'productionView',
  'researchesView',
  'missionPlannerView',
  'operationsView',
  'reportsView',
  'mailView',
  'diplomacyView'
] as const;

export type TutorialViewKey = typeof TUTORIAL_VIEW_KEYS[number];

export type TutorialReadState = Record<TutorialViewKey, boolean>;

export type TutorialCharacterSide = 'left' | 'right';

export type TutorialStep = {
  heading: string;
  bodyHtml: string;
  characterImages: string[];
  characterSide: TutorialCharacterSide;
  bubblePosition: 'top' | 'bottom';
  mirrorCharacter?: boolean;
  imagePath?: string;
  imageAlt?: string;
  targetId?: string;
  targetPadding?: number;
};

export type TutorialEntry = {
  key: TutorialViewKey;
  title: string;
  steps: TutorialStep[];
};

export function createTutorialReadState(isRead: boolean): TutorialReadState {
  return {
    galacticView: isRead,
    imperiumView: isRead,
    planetView: isRead,
    buildingsView: isRead,
    productionView: isRead,
    researchesView: isRead,
    missionPlannerView: isRead,
    operationsView: isRead,
    reportsView: isRead,
    mailView: isRead,
    diplomacyView: isRead
  };
}

export function normalizeTutorialReadState(
  value: Partial<Record<string, unknown>> | null | undefined,
  fallback: boolean
): TutorialReadState {
  const defaults = createTutorialReadState(fallback);
  if (!value) {
    return defaults;
  }

  const normalized = { ...defaults };
  for (const key of TUTORIAL_VIEW_KEYS) {
    const entry = value[key];
    if (typeof entry === 'boolean') {
      normalized[key] = entry;
    }
  }

  return normalized;
}
