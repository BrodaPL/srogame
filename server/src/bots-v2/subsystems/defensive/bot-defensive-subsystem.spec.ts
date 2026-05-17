import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../../src/app/models/enums/defence-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { ManyDefences } from '../../../../../src/app/models/defences/many-defences.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { Player } from '../../../../../src/app/models/player.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotDefensiveSubsystem } from './bot-defensive-subsystem.js';

describe('BotDefensiveSubsystem', () => {
  it('emits a structural-only unlock research request when SAM is gated by missile tech', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 2);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 3);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 3);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 3);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 4);
    planet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 1);

    const result = runDefensiveSubsystem(galaxy, bot);

    expect(result.planetResults?.[0]?.branch).toBe('STRUCTURAL_ONLY');
    expect(result.proposals[0]?.kind).toBe('RESEARCH');
    expect([
      TechnologyType.MISSILES_WEAPONS,
      TechnologyType.ENERGY_TECHNOLOGY
    ]).toContain((result.proposals[0]?.requestPayload as { technologyType?: TechnologyType })?.technologyType);
    expect(result.proposals[0]?.debug?.goalFamily).toBe('UNLOCK');
    expect([
      DefenceType.SAM_SITE,
      DefenceType.LIGHT_BEAM_CANNON
    ]).toContain(result.proposals[0]?.debug?.finalDefenceType as DefenceType);
  });

  it('does not emit actual defence production on immature planets', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 2);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 2);

    const result = runDefensiveSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) => proposal.kind === 'SHIPYARD')).toBe(false);
  });

  it('emits one bunker request and one production request when defenses are already buildable', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 7);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 7);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 7);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 6);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 8);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 1);

    const result = runDefensiveSubsystem(galaxy, bot);

    expect(result.planetResults?.[0]?.branch).toBe('STRUCTURE_AND_PRODUCTION');
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.some((proposal) =>
      proposal.kind !== 'SHIPYARD'
      && proposal.debug?.goalFamily !== 'PRODUCTION'
    )).toBe(true);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { defenceType?: DefenceType }).defenceType === DefenceType.SAM_SITE
    )).toBe(true);
  });

  it('does not emit SAM production just because one is installed when missile tech is still missing', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 1);

    const result = runDefensiveSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { defenceType?: DefenceType }).defenceType === DefenceType.SAM_SITE
    )).toBe(false);
    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'UNLOCK'
      && goal.finalDefenceType === DefenceType.SAM_SITE
    )).toBe(true);
  });

  it('falls back to production-only when bunker is on target and current unlocks are exhausted', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 7);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 7);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 7);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 6);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 7);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 2);
    planet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 5);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 2);
    bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);

    const result = runDefensiveSubsystem(galaxy, bot);

    expect(result.planetResults?.[0]?.branch).toBe('PRODUCTION_ONLY');
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.every((proposal) => proposal.kind === 'SHIPYARD')).toBe(true);
  });

  it('suppresses additional missile-layer production once the soft cap is already exceeded on a peaceful planet', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 2);
    bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);
    planet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 200);

    const result = runDefensiveSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { defenceType?: DefenceType }).defenceType === DefenceType.SAM_SITE
    )).toBe(false);
  });

  it('can unlock orbital missile launchers through a shipyard upgrade request', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseDefensivePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 2);
    bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);

    const result = runDefensiveSubsystem(galaxy, bot);
    const orbitalGoal = result.goals?.find((goal) => goal.finalDefenceType === DefenceType.ORBITAL_MISSILE_LAUNCHER);

    expect(orbitalGoal).toBeDefined();
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'BUILDING'
      && (proposal.requestPayload as { buildingType?: BuildingType }).buildingType === BuildingType.SHIPYARD
    )).toBe(true);
  });
});

function runDefensiveSubsystem(galaxy: Galaxy, bot: Player) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
    enabledSubsystems: {
      economic: false,
      defensive: true,
      warfare: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      },
  });

  return new BotDefensiveSubsystem().generate({
    snapshot,
    memory: createDefaultBotMemoryV2()
  });
}

function createBotWorld() {
  const system = new SolarSystem('BotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const planet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  system.planets[0] = planet;

  const bot = new Player(
    1,
    'Bot-1',
    [planet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[1, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, planet };
}

function configureBaseDefensivePlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 2);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
  planet.rBDSFTQ.resources = new ResourcesPack(5000, 5000, 5000);
  planet.rBDSFTQ.defences = ManyDefences.empty();
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
}
