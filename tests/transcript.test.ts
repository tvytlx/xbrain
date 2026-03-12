import assert from "node:assert/strict";
import test from "node:test";

import { deriveChatMessages } from "../src/core/transcript.ts";
import type { EventEnvelope } from "../src/core/types.ts";

test("deriveChatMessages truncates long agent failure messages for UI display", () => {
  const messages = deriveChatMessages([
    {
      id: "evt_1",
      sessionId: "session_1",
      seq: 1,
      ts: new Date().toISOString(),
      kind: "agent_failed",
      actorId: "gemini",
      turnId: "turn_1",
      payload: {
        agentId: "gemini",
        error:
          "Error: " +
          "very long auth failure details ".repeat(20) +
          "\n" +
          "stack trace line",
        markedUnavailable: true,
      },
    } satisfies EventEnvelope,
  ]);

  assert.equal(messages.length, 1);
  assert.match(messages[0]!.text, /^gemini is now unavailable: /);
  assert.match(messages[0]!.text, /\.\.\.$/);
  assert.doesNotMatch(messages[0]!.text, /\n/);
  assert.equal(messages[0]!.text.length <= 220, true);
});
