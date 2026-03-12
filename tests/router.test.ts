import test from "node:test";
import assert from "node:assert/strict";

import { classifyIntent, pickLead } from "../src/core/router.ts";

test("classifyIntent detects coding prompts", () => {
  assert.equal(classifyIntent("I have a TypeScript error in my CLI"), "coding");
});

test("pickLead prefers the strongest coding agent", () => {
  const result = pickLead(
    [
      {
        id: "codex",
        enabled: true,
        binary: "codex",
        availability: "ready",
        capabilityProfile: {
          coding: 1,
          analysis: 0.8,
          ideation: 0.5,
          critique: 0.6,
        },
        avgLatencyMs: 0,
        recentPassRate: 0,
        lastLeadTurn: null,
        lastSpokeTurn: null,
      },
      {
        id: "gemini",
        enabled: true,
        binary: "gemini",
        availability: "ready",
        capabilityProfile: {
          coding: 0.5,
          analysis: 0.7,
          ideation: 1,
          critique: 0.6,
        },
        avgLatencyMs: 0,
        recentPassRate: 0,
        lastLeadTurn: null,
        lastSpokeTurn: null,
      },
    ],
    "Fix a TypeScript build error",
    {
      turnNumber: 1,
      lastLeadAgentId: null,
    },
  );

  assert.equal(result.agentId, "codex");
});
