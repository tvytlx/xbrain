import { AGENT_IDS, type AgentId } from "./types.ts";

const aliasToAgentId = new Map<string, AgentId>([
  ["codex", "codex"],
  ["claudecode", "claudecode"],
  ["claude", "claudecode"],
  ["gemini", "gemini"],
]);

export function parseMentions(input: string): AgentId[] {
  const matches = input.matchAll(/@([a-zA-Z][a-zA-Z0-9_-]*)/g);
  const ordered = new Set<AgentId>();

  for (const match of matches) {
    const alias = match[1]?.toLowerCase();
    const agentId = aliasToAgentId.get(alias);

    if (agentId) {
      ordered.add(agentId);
    }
  }

  return [...ordered];
}

export function isAgentId(value: string): value is AgentId {
  return AGENT_IDS.includes(value as AgentId);
}
