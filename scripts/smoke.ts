import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MockAdapter } from "../src/adapters/mock-adapter.ts";
import { Orchestrator } from "../src/core/orchestrator.ts";
import { FileStorage } from "../src/storage/file-store.ts";

async function main(): Promise<void> {
  const baseDir = await mkdtemp(join(tmpdir(), "xbrain-smoke-"));
  const storage = new FileStorage(baseDir);
  const orchestrator = await Orchestrator.create({
    storage,
    agents: [
      {
        id: "codex",
        adapter: new MockAdapter({
          id: "codex",
          capabilityProfile: {
            coding: 1,
            analysis: 0.8,
            ideation: 0.6,
            critique: 0.7,
          },
          handler: () => ({
            kind: "message",
            text: "Codex lead reply",
            durationMs: 10,
          }),
        }),
        enabled: true,
        binary: "codex-mock",
        availability: "ready",
        capabilityProfile: {
          coding: 1,
          analysis: 0.8,
          ideation: 0.6,
          critique: 0.7,
        },
        avgLatencyMs: 0,
        recentPassRate: 0,
        lastLeadTurn: null,
        lastSpokeTurn: null,
      },
      {
        id: "gemini",
        adapter: new MockAdapter({
          id: "gemini",
          capabilityProfile: {
            coding: 0.6,
            analysis: 0.7,
            ideation: 1,
            critique: 0.6,
          },
          handler: (input) =>
            input.allowPass
              ? {
                  kind: "pass",
                  reason: "No delta",
                  durationMs: 5,
                }
              : {
                  kind: "message",
                  text: "Gemini reply",
                  durationMs: 5,
                },
        }),
        enabled: true,
        binary: "gemini-mock",
        availability: "ready",
        capabilityProfile: {
          coding: 0.6,
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
  });

  const messages = await orchestrator.submitUserMessage("How should I design the router?");

  assert.equal(messages.length >= 2, true);
  assert.equal(messages[0]?.authorId, "user");
  assert.equal(messages[1]?.authorId, "codex");

  console.log("Smoke test passed.");
  console.log(`Session: ${orchestrator.session.id}`);
}

await main();
