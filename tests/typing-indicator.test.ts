import assert from "node:assert/strict";
import test from "node:test";

import { reduceThinkingAgents, formatThinkingIndicator } from "../src/ui/typing-indicator.ts";
import type { EventEnvelope } from "../src/core/types.ts";

function createEvent(kind: EventEnvelope["kind"], payload: Record<string, unknown>): EventEnvelope {
  return {
    id: "evt_test",
    sessionId: "session_test",
    seq: 1,
    ts: new Date().toISOString(),
    kind,
    actorId: "system",
    turnId: "turn_test",
    payload,
  };
}

test("reduceThinkingAgents adds and removes agents based on orchestration events", () => {
  const afterLeadInvoke = reduceThinkingAgents([], createEvent("agent_invoked", {
    agentId: "codex",
    roleInTurn: "lead",
    allowPass: false,
  }));
  const afterChallengerInvoke = reduceThinkingAgents(afterLeadInvoke, createEvent("agent_invoked", {
    agentId: "claudecode",
    roleInTurn: "challenger",
    allowPass: true,
  }));
  const afterLeadReply = reduceThinkingAgents(afterChallengerInvoke, createEvent("assistant_message_committed", {
    agentId: "codex",
    roleInTurn: "lead",
    messageId: "msg_test",
    text: "reply",
    replyToMessageId: "msg_user",
    durationMs: 10,
  }));
  const afterTurnComplete = reduceThinkingAgents(afterLeadReply, createEvent("turn_completed", {}));

  assert.deepEqual(afterLeadInvoke, ["codex"]);
  assert.deepEqual(afterChallengerInvoke, ["codex", "claudecode"]);
  assert.deepEqual(afterLeadReply, ["claudecode"]);
  assert.deepEqual(afterTurnComplete, []);
});

test("formatThinkingIndicator supports singular and plural labels", () => {
  assert.equal(formatThinkingIndicator(["codex"], 0), "Codex is thinking.");
  assert.equal(
    formatThinkingIndicator(["codex", "claudecode"], 1),
    "Codex and Claude are thinking..",
  );
  assert.equal(
    formatThinkingIndicator(["codex", "claudecode", "gemini"], 2),
    "Codex, Claude, and Gemini are thinking...",
  );
});
