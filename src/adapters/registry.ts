import type { AgentAdapter } from "./base.ts";
import { CliAgentAdapter } from "./cli-agent-adapter.ts";
import type { AgentRuntimeState, CapabilityProfile } from "../core/types.ts";

export type ActiveAgent = AgentRuntimeState & {
  adapter: AgentAdapter;
};

const AVAILABILITY_PROBE_TIMEOUT_MS = 35_000;

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
        availability: "ready",
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

export async function probeAgentAvailability(
  agents: ActiveAgent[],
  cwd: string,
): Promise<ActiveAgent[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const response = await agent.adapter.invoke({
        agentId: agent.id,
        roleInTurn: "lead",
        prompt: buildAvailabilityProbePrompt(agent.id),
        cwd,
        timeoutMs: AVAILABILITY_PROBE_TIMEOUT_MS,
        allowPass: false,
      });

      if (response.kind === "message") {
        return {
          ...agent,
          availability: "ready" as const,
          unavailableReason: undefined,
        };
      }

      return {
        ...agent,
        availability: "unavailable" as const,
        unavailableReason: summarizeProbeFailure(response.kind === "pass" ? response.reason : response.error),
      };
    }),
  );
}

function buildAvailabilityProbePrompt(agentId: string): string {
  return [
    "You are being checked for agent availability in a multi-agent chat app.",
    `Your agent id is ${agentId}.`,
    "Reply with JSON only.",
    'Use exactly {"kind":"message","text":"ready"}',
  ].join("\n");
}

function summarizeProbeFailure(error: string): string {
  return error
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 200) ?? "Unavailable.";
}
