import assert from "node:assert/strict";
import test from "node:test";

import { renderConversationSvg } from "../src/share/screenshot.ts";
import type { ChatMessage } from "../src/core/types.ts";

test("renderConversationSvg excludes system messages and includes updated footer copy", () => {
  const svg = renderConversationSvg([
    {
      id: "msg_user",
      turnId: "turn_1",
      authorId: "user",
      role: "user",
      text: "How should I position this product?",
      visible: true,
    },
    {
      id: "msg_system",
      turnId: "turn_1",
      authorId: "system",
      role: "system",
      text: "Screenshot copied to clipboard.",
      visible: true,
    },
    {
      id: "msg_ai",
      turnId: "turn_1",
      authorId: "codex",
      role: "assistant",
      text: "Lead with the multi-AI chat angle.",
      visible: true,
    },
  ] satisfies ChatMessage[]);

  assert.match(svg, /XBrain/);
  assert.match(svg, /Multi-AI chat for thinking in public/);
  assert.match(svg, /Install: npm install -g xbrain/);
  assert.match(svg, /How should I position this product\?/);
  assert.match(svg, /Lead with the multi-AI chat angle\./);
  assert.doesNotMatch(svg, /Screenshot copied to clipboard\./);
});

test("renderConversationSvg keeps English words intact when wrapping", () => {
  const svg = renderConversationSvg([
    {
      id: "msg_ai",
      turnId: "turn_2",
      authorId: "claudecode",
      role: "assistant",
      text:
        "I am ready to help with software engineering tasks across the product, launch, messaging, and packaging workstreams.",
      visible: true,
    },
  ] satisfies ChatMessage[]);

  assert.match(svg, /software engineering tasks/);
  assert.doesNotMatch(svg, /task<\/text>\s*<text[^>]*>s/);
});

test("renderConversationSvg uses a CJK-friendly font stack for Chinese content", () => {
  const svg = renderConversationSvg([
    {
      id: "msg_cn",
      turnId: "turn_3",
      authorId: "codex",
      role: "assistant",
      text: "先有蛋，因为在鸡出现之前，早就有会下蛋的动物了。",
      visible: true,
    },
  ] satisfies ChatMessage[]);

  assert.match(svg, /PingFang SC/);
});
