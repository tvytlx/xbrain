import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MockAdapter } from "../src/adapters/mock-adapter.ts";
import { Orchestrator } from "../src/core/orchestrator.ts";
import { FileStorage } from "../src/storage/file-store.ts";

test("orchestrator records lead reply and challenger pass", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "xbrain-test-"));
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
            text: "Codex answer",
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
            coding: 0.5,
            analysis: 0.7,
            ideation: 1,
            critique: 0.6,
          },
          handler: (input) =>
            input.allowPass
              ? {
                  kind: "pass",
                  reason: "No new info",
                  durationMs: 5,
                }
              : {
                  kind: "message",
                  text: "Gemini answer",
                  durationMs: 5,
                },
        }),
        enabled: true,
        binary: "gemini-mock",
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
  });

  const messages = await orchestrator.submitUserMessage("Need help with a CLI bug");
  const events = await storage.loadEvents(orchestrator.session.id);

  assert.equal(messages.some((message) => message.authorId === "codex"), true);
  assert.equal(events.some((event) => event.kind === "assistant_passed"), true);
});

test("orchestrator marks failed agents unavailable and skips future routing", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "xbrain-test-"));
  const storage = new FileStorage(baseDir);
  const orchestrator = await Orchestrator.create({
    storage,
    agents: [
      {
        id: "gemini",
        adapter: new MockAdapter({
          id: "gemini",
          capabilityProfile: {
            coding: 0.5,
            analysis: 0.7,
            ideation: 1,
            critique: 0.6,
          },
          handler: () => ({
            kind: "failure",
            error: "403 forbidden",
            durationMs: 5,
          }),
        }),
        enabled: true,
        binary: "gemini-mock",
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
            text: "Codex fallback answer",
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
    ],
  });

  await orchestrator.submitUserMessage("Need launch ideas for the product");

  assert.equal(
    orchestrator.agents.find((agent) => agent.id === "gemini")?.availability,
    "unavailable",
  );

  const secondMessages = await orchestrator.submitUserMessage("More launch ideas please");
  const secondTurnMessages = secondMessages.slice(-2);

  assert.equal(secondTurnMessages.some((message) => message.authorId === "gemini"), false);
  assert.equal(secondTurnMessages.some((message) => message.authorId === "codex"), true);
});
