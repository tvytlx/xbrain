import assert from "node:assert/strict";
import test from "node:test";

import { parseStructuredOutput } from "../src/adapters/cli-agent-adapter.ts";

test("parseStructuredOutput accepts direct structured message JSON", () => {
  const response = parseStructuredOutput(
    '{"kind":"message","text":"pong"}',
    false,
    10,
  );

  assert.deepEqual(response, {
    kind: "message",
    text: "pong",
    durationMs: 10,
  });
});

test("parseStructuredOutput accepts Claude JSON wrapper with result string", () => {
  const response = parseStructuredOutput(
    JSON.stringify({
      type: "result",
      result: '{"kind":"message","text":"pong"}',
    }),
    false,
    12,
  );

  assert.deepEqual(response, {
    kind: "message",
    text: "pong",
    durationMs: 12,
  });
});

test("parseStructuredOutput accepts Claude JSON wrapper with structured_output", () => {
  const response = parseStructuredOutput(
    JSON.stringify({
      type: "result",
      structured_output: {
        kind: "pass",
        reason: "No substantial addition.",
      },
    }),
    true,
    14,
  );

  assert.deepEqual(response, {
    kind: "pass",
    reason: "No substantial addition.",
    durationMs: 14,
  });
});
