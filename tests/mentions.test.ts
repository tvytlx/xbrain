import test from "node:test";
import assert from "node:assert/strict";

import { parseMentions } from "../src/core/mentions.ts";

test("parseMentions keeps unique mention order", () => {
  assert.deepEqual(parseMentions("@codex hi @gemini @codex"), ["codex", "gemini"]);
});

test("parseMentions maps @claude to claudecode", () => {
  assert.deepEqual(parseMentions("@claude please review"), ["claudecode"]);
});
