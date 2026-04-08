export enum StartingHomeworldPreset {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

export const STARTING_HOMEWORLD_PRESET_VALUES: StartingHomeworldPreset[] = [
  StartingHomeworldPreset.LOW,
  StartingHomeworldPreset.MEDIUM,
  StartingHomeworldPreset.HIGH
];

export const STARTING_HOMEWORLD_PRESET_TOOLTIPS: Record<StartingHomeworldPreset, string> = {
  [StartingHomeworldPreset.LOW]: [
    'Low preset',
    'Buildings: Metal Storage 1, Crystal Storage 1, Deuterium Tank 1, Metal Mine 1, Crystal Mine 1, Solar 1, Nuclear 1, Robotics Factory 1.',
    'Tech: none.',
    'Ships: none.',
    'Defences: none.'
  ].join('\n'),
  [StartingHomeworldPreset.MEDIUM]: [
    'Medium preset',
    'Buildings: Metal Storage 1, Crystal Storage 1, Deuterium Tank 1, Metal Mine 2, Crystal Mine 1, Deuterium Synthesizer 1, Solar 2, Nuclear 2, Robotics Factory 2, Shipyard 1, Research Lab 1.',
    'Tech: Energy Technology 1, Fusion Drive 1, Hyperspace Drive 1, Espionage Technology 1.',
    'Ships: Spy Probe 8, Transporter 1.',
    'Defences: SAM Site 4.'
  ].join('\n'),
  [StartingHomeworldPreset.HIGH]: [
    'High preset',
    'Buildings: Metal Storage 2, Crystal Storage 2, Deuterium Tank 2, Metal Mine 3, Crystal Mine 2, Deuterium Synthesizer 1, Solar 2, Nuclear 2, Fusion Reactor 1, Robotics Factory 3, Shipyard 2, Research Lab 1.',
    'Tech: Energy Technology 1, Fusion Drive 1, Hyperspace Drive 1, Computer Technology 1, Espionage Technology 2, Adaptive Technology 1.',
    'Ships: Fighter 8, Spy Probe 16, Battle Ship 1, Transporter 1, Colonizer 1.',
    'Defences: SAM Site 10.'
  ].join('\n')
};
