import { describe, expect, it } from 'vitest';
import { DiplomaticProposalState } from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { DiplomacyResolver } from '../../../src/app/models/diplomacy/diplomacy-resolver.js';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { createBotBenchmarkScenario } from '../../../src/app/models/testing/bot-benchmark-scenarios.js';
import { runBotTurnPhase } from './bot-turn-runner.js';
import { clearBotDecisionTraces, getBotDecisionTraces } from './bot-debug-store.js';

describe('bot benchmark scenarios', () => {
  it('economy bootstrap produces at least one queue action', () => {
    const scenario = createBotBenchmarkScenario('botEconomyBootstrap');
    const homePlanet = scenario.focusBot.planets[0]!;

    runBotTurnPhase(scenario.galaxy);

    expect(
      homePlanet.rBDSFTQ.buildingQueue.length
      + homePlanet.rBDSFTQ.shipyardQueue.length
      + (homePlanet.rBDSFTQ.currentResearchQueue ? 1 : 0)
    ).toBeGreaterThan(0);
  });

  it('colonize nearby launches a colonization fleet', () => {
    const scenario = createBotBenchmarkScenario('botColonizeNearby');

    runBotTurnPhase(scenario.galaxy);

    expect(scenario.galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === scenario.focusBot.playerId && fleet.missionType === FleetMissionType.COLONIZE
    )).toBe(true);
  });

  it('reject risky attack does not launch an attack fleet', () => {
    const scenario = createBotBenchmarkScenario('botRejectRiskyAttack');

    runBotTurnPhase(scenario.galaxy);

    expect(scenario.galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === scenario.focusBot.playerId && fleet.missionType === FleetMissionType.ATTACK
    )).toBe(false);
  });

  it('frontier reinforce launches a guard fleet', () => {
    const scenario = createBotBenchmarkScenario('botFrontierReinforce');

    runBotTurnPhase(scenario.galaxy);

    expect(scenario.galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === scenario.focusBot.playerId && fleet.missionType === FleetMissionType.DEFEND
    )).toBe(true);
  });

  it('accept peace under pressure approves the incoming peace proposal', () => {
    const scenario = createBotBenchmarkScenario('botAcceptPeaceUnderPressure');
    const proposal = scenario.galaxy.diplomaticProposals[0]!;
    const otherPlayerId = proposal.fromPlayerId;

    runBotTurnPhase(scenario.galaxy);

    expect(proposal.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(new DiplomacyResolver(scenario.galaxy.diplomaticRelations).getStatus(
      scenario.focusBot.playerId,
      otherPlayerId
    )).toBe(DiplomaticStatus.PEACE);
  });

  it('reject peace when dominant leaves the proposal rejected and relation hostile', () => {
    const scenario = createBotBenchmarkScenario('botRejectPeaceWhenDominant');
    const proposal = scenario.galaxy.diplomaticProposals[0]!;
    const otherPlayerId = proposal.fromPlayerId;

    runBotTurnPhase(scenario.galaxy);

    expect(proposal.state).toBe(DiplomaticProposalState.REJECTED);
    expect(new DiplomacyResolver(scenario.galaxy.diplomaticRelations).getStatus(
      scenario.focusBot.playerId,
      otherPlayerId
    )).toBe(DiplomaticStatus.WAR);
  });

  it('propose peace when overextended creates an outgoing peace proposal', () => {
    const scenario = createBotBenchmarkScenario('botProposePeaceWhenOverextended');

    runBotTurnPhase(scenario.galaxy);

    expect(scenario.galaxy.diplomaticProposals.some((proposal) =>
      proposal.fromPlayerId === scenario.focusBot.playerId
      && proposal.requestedStatus === DiplomaticStatus.PEACE
      && proposal.state === DiplomaticProposalState.PENDING
    )).toBe(true);
  });

  it('propose alliance from peace only creates an outgoing alliance proposal', () => {
    const scenario = createBotBenchmarkScenario('botProposeAllianceFromPeaceOnly');

    runBotTurnPhase(scenario.galaxy);

    expect(scenario.galaxy.diplomaticProposals.some((proposal) =>
      proposal.fromPlayerId === scenario.focusBot.playerId
      && proposal.requestedStatus === DiplomaticStatus.ALLIED
      && proposal.state === DiplomaticProposalState.PENDING
    )).toBe(true);
  });

  it('records a trace for each benchmark scenario', () => {
    const scenario = createBotBenchmarkScenario('botFrontierReinforce');
    clearBotDecisionTraces();

    runBotTurnPhase(scenario.galaxy);

    const traces = getBotDecisionTraces(scenario.focusBot.playerId);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.chosenActions.length).toBeGreaterThan(0);
    expect(traces[0]?.actionBudget.stopReason).not.toBeNull();
  });
});
