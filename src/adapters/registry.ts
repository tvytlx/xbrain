import type { AgentAdapter } from "./base.ts";
import { CliAgentAdapter } from "./cli-agent-adapter.ts";
import type { AgentRuntimeState, CapabilityProfile } from "../core/types.ts";

export type ActiveAgent = AgentRuntimeState & {
  adapter: AgentAdapter;
};

const capabilityProfiles: Record<string, CapabilityProfile> = {
  codex: {
    coding: 1,
    analysis: 0.8,
    ideation: 0.6,
    critique: 0.8,
  },
  claudecode: {
    coding: 0.9,
    analysis: 1,
    ideation: 0.75,
    critique: 1,
  },
  gemini: {
    coding: 0.75,
    analysis: 0.8,
    ideation: 1,
    critique: 0.75,
  },
};

export function createDefaultAdapters(): AgentAdapter[] {
  return [
    new CliAgentAdapter({
      id: "codex",
      capabilityProfile: capabilityProfiles.codex,
      candidateBinaries: ["codex"],
    }),
    new CliAgentAdapter({
      id: "claudecode",
      capabilityProfile: capabilityProfiles.claudecode,
      candidateBinaries: ["claudecode", "claude"],
    }),
    new CliAgentAdapter({
      id: "gemini",
      capabilityProfile: capabilityProfiles.gemini,
      candidateBinaries: ["gemini"],
    }),
  ];
}

export async function detectActiveAgents(adapters: AgentAdapter[]): Promise<ActiveAgent[]> {
  const discovered = await Promise.all(
    adapters.map(async (adapter) => {
      const binary = await adapter.detect();

      if (!binary) {
        return null;
      }

      return {
        id: adapter.id,
        enabled: true,
        binary,
        availability: "unknown",
        capabilityProfile: adapter.capabilityProfile,
        avgLatencyMs: 0,
        recentPassRate: 0,
        lastLeadTurn: null,
        lastSpokeTurn: null,
        adapter,
      } satisfies ActiveAgent;
    }),
  );

  return discovered.filter(Boolean) as ActiveAgent[];
}
