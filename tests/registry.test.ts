import test from "node:test";
import assert from "node:assert/strict";

import { detectActiveAgents } from "../src/adapters/registry.ts";
import type { AgentAdapter } from "../src/adapters/base.ts";
import { MockAdapter } from "../src/adapters/mock-adapter.ts";

function createMockAdapter(input: {
  id: "codex" | "claudecode" | "gemini";
  result: "ready" | "failure";
}): AgentAdapter {
  return new MockAdapter({
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
  });
}

test("detectActiveAgents marks installed agents as unknown until first real use", async () => {
  const detected = await detectActiveAgents([
    createMockAdapter({ id: "claudecode", result: "ready" }),
    createMockAdapter({ id: "gemini", result: "failure" }),
  ]);

  assert.equal(detected.find((agent) => agent.id === "claudecode")?.availability, "unknown");
  assert.equal(detected.find((agent) => agent.id === "gemini")?.availability, "unknown");
});
