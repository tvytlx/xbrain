import test from "node:test";
import assert from "node:assert/strict";

import { probeAgentAvailability, type ActiveAgent } from "../src/adapters/registry.ts";
import { MockAdapter } from "../src/adapters/mock-adapter.ts";

function createMockAgent(input: {
  id: "codex" | "claudecode" | "gemini";
  result: "ready" | "failure";
}): ActiveAgent {
  return {
    id: input.id,
    adapter: new MockAdapter({
      id: input.id,
      capabilityProfile: {
        coding: 1,
        analysis: 1,
        ideation: 1,
        critique: 1,
      },
      handler: () =>
        input.result === "ready"
          ? {
              kind: "message",
              text: "ready",
              durationMs: 5,
            }
          : {
              kind: "failure",
              error: "403 forbidden",
              durationMs: 5,
            },
    }),
    enabled: true,
    binary: `${input.id}-mock`,
    availability: "ready",
    capabilityProfile: {
      coding: 1,
      analysis: 1,
      ideation: 1,
      critique: 1,
    },
    avgLatencyMs: 0,
    recentPassRate: 0,
    lastLeadTurn: null,
    lastSpokeTurn: null,
  };
}

test("probeAgentAvailability marks unhealthy agents unavailable", async () => {
  const probed = await probeAgentAvailability(
    [createMockAgent({ id: "claudecode", result: "ready" }), createMockAgent({ id: "gemini", result: "failure" })],
    process.cwd(),
  );

  assert.equal(probed.find((agent) => agent.id === "claudecode")?.availability, "ready");
  assert.equal(probed.find((agent) => agent.id === "gemini")?.availability, "unavailable");
});
