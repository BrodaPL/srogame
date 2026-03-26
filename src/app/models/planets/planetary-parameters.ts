export class PlanetaryParameters {
  constructor(
    public metalModifier: number,
    public crystalModifier: number,
    public deuteriumModifier: number,
    public energyModifierRES: number,
    public energyModifierNuclear: number,
    public scienceModifier: number,
    public industryModifier: number,
    // Affects Sensor Phalanx range and espionage level. -60%..60%. 5% steps.
    public anomaliesAndNoise: number,
    // -80%..50%. Affects Jumpgate + Interstellar Trade Port capacity base level. 5% steps.
    public hyperspaceParameters: number
  ) {}

  public copy(): PlanetaryParameters {
    return new PlanetaryParameters(
      this.metalModifier,
      this.crystalModifier,
      this.deuteriumModifier,
      this.energyModifierRES,
      this.energyModifierNuclear,
      this.scienceModifier,
      this.industryModifier,
      this.anomaliesAndNoise,
      this.hyperspaceParameters
    );
  }
}
