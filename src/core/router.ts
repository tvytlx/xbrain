import type {
  AgentRuntimeState,
  AgentId,
  Intent,
  LeadScore,
  TurnSnapshot,
} from "./types.ts";

const codingPattern =
  /```|error|exception|stack trace|bug|refactor|typescript|swift|python|node|npm|yarn|tsconfig|file|function|class|cli|command/i;
const analysisPattern =
  /trade-?off|architecture|design|router|orchestrator|plan|strategy|decision|mvp/i;
const ideationPattern =
  /idea|brainstorm|naming|positioning|hook|content|tweet|x\b|launch|growth/i;
const critiquePattern =
  /review|critic|risk|challenge|counter|argue|rebut|critique|weakness/i;

export function classifyIntent(input: string): Intent {
  if (codingPattern.test(input)) {
    return "coding";
  }

  if (critiquePattern.test(input)) {
    return "critique";
  }

  if (analysisPattern.test(input)) {
    return "analysis";
  }

  if (ideationPattern.test(input)) {
    return "ideation";
  }

  return "analysis";
}

function getFairnessScore(agent: AgentRuntimeState, turnNumber: number): number {
  if (agent.lastLeadTurn === null) {
    return 40;
  }

  return Math.min(40, Math.max(0, (turnNumber - agent.lastLeadTurn) * 10));
}

function getContinuityScore(agent: AgentRuntimeState, turnNumber: number): number {
  if (agent.lastSpokeTurn === null) {
    return 0;
  }

  return turnNumber - agent.lastSpokeTurn <= 2 ? 10 : 0;
}

function getConsecutivePenalty(agent: AgentRuntimeState, snapshot: TurnSnapshot): number {
  if (snapshot.lastLeadAgentId === agent.id) {
    return 20;
  }

  return 0;
}

function getLatencyPenalty(agent: AgentRuntimeState): number {
  if (agent.avgLatencyMs <= 0) {
    return 0;
  }

  return Math.min(15, Math.round(agent.avgLatencyMs / 2_000));
}

function getPassPenalty(agent: AgentRuntimeState): number {
  return Math.round(agent.recentPassRate * 10);
}

export function buildLeadScores(
  agents: AgentRuntimeState[],
  input: string,
  snapshot: TurnSnapshot,
): { intent: Intent; scores: LeadScore[] } {
  const intent = classifyIntent(input);
  const scores = agents
    .filter((agent) => agent.enabled && agent.availability === "ready")
    .map((agent) => {
      const score =
        getFairnessScore(agent, snapshot.turnNumber) +
        Math.round(agent.capabilityProfile[intent] * 25) +
        getContinuityScore(agent, snapshot.turnNumber) -
        getConsecutivePenalty(agent, snapshot) -
        getLatencyPenalty(agent) -
        getPassPenalty(agent);

      return { agentId: agent.id, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.agentId.localeCompare(right.agentId);
    });

  return { intent, scores };
}

export function pickLead(
  agents: AgentRuntimeState[],
  input: string,
  snapshot: TurnSnapshot,
): { agentId: AgentId | null; intent: Intent; scores: LeadScore[] } {
  const { intent, scores } = buildLeadScores(agents, input, snapshot);

  return {
    agentId: scores[0]?.agentId ?? null,
    intent,
    scores,
  };
}
