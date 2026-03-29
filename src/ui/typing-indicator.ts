import type { AgentId, EventEnvelope } from "../core/types.ts";

type AgentEventPayload = {
  agentId: AgentId;
};

export function reduceThinkingAgents(
  current: AgentId[],
  event: EventEnvelope,
): AgentId[] {
  switch (event.kind) {
    case "user_message_committed":
    case "turn_started":
      return [];
    case "agent_invoked": {
      const agentId = (event.payload as AgentEventPayload).agentId;
      return current.includes(agentId) ? current : [...current, agentId];
    }
    case "assistant_message_committed":
    case "assistant_passed":
    case "agent_failed": {
      const agentId = (event.payload as AgentEventPayload).agentId;
      return current.filter((candidate) => candidate !== agentId);
    }
    case "turn_completed":
      return [];
    default:
      return current;
  }
}

export function formatThinkingIndicator(agentIds: AgentId[], frame: number): string | null {
  if (agentIds.length === 0) {
    return null;
  }

  const subject = formatAgentList(agentIds.map(getAgentDisplayName));
  const verb = agentIds.length === 1 ? "is" : "are";
  const dots = ".".repeat((frame % 3) + 1).padEnd(3, " ");

  return `${subject} ${verb} thinking [${dots}]`;
}

export function getAgentDisplayName(agentId: AgentId): string {
  switch (agentId) {
    case "codex":
      return "Codex";
    case "claudecode":
      return "Claude";
    case "gemini":
      return "Gemini";
  }
}

function formatAgentList(names: string[]): string {
  if (names.length === 1) {
    return names[0]!;
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}
