export type MissionCheckSeverity = 'error' | 'note';

export type MissionCheck = {
  text: string;
  textKey?: string;
  textParams?: Record<string, string | number | boolean | null | undefined>;
  severity: MissionCheckSeverity;
};
