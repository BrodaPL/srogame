export class PlanetaryParameters {
  constructor(
    public metalModifier: number,
    public crystalModifier: number,
    public deuteriumModifier: number,
    public energyModifierRES: number,
    public energyModifierNuclear: number,
    public scienceModifier: number,
    public industryModifier: number,
    // Affects Sensor Phalanx range. -60%..60%. Each 15% also shifts espionage level. 5% steps.
    public anomaliesAndNoise: number,
    // -80%..50%. Affects Jumpgate + Interstellar Trade Port capacity base level. 5% steps.
    public hyperspaceParameters: number
  ) {}
}
