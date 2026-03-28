export class PlanetaryParameters {
  constructor(
    public metalModifier: number,
    public crystalModifier: number,
    public deuteriumModifier: number,
    public energyModifierRES: number,
    public energyModifierNuclear: number,
    public scienceModifier: number,
    public industryModifier: number,
    // Direct multiplier affecting Sensor Phalanx range and espionage level.
    public anomaliesAndNoise: number,
    // Direct multiplier affecting Jump Gate and Interstellar Trade Port capacity.
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
