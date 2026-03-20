export type MissionCheckSeverity = 'error' | 'note';

export type MissionCheck = {
  text: string;
  severity: MissionCheckSeverity;
};
