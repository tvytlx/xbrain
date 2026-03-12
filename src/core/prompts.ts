import type { AgentId, AgentRoleInTurn, ChatMessage, Intent } from "./types.ts";

function renderTranscript(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "No previous messages.";
  }

  return messages
    .map((message) => `[${message.authorId}] ${message.text}`)
    .join("\n");
}

export function buildAgentPrompt(input: {
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  intent: Intent;
  userText: string;
  history: ChatMessage[];
  allowPass: boolean;
  leadReply?: string;
}): string {
  const sections = [
    "You are participating in a shared multi-agent chat room.",
    `Your agent id is ${input.agentId}.`,
    `Your role in this turn is ${input.roleInTurn}.`,
    `The detected intent is ${input.intent}.`,
    "",
    "Conversation history:",
    renderTranscript(input.history),
    "",
    `User message: ${input.userText}`,
  ];

  if (input.leadReply) {
    sections.push("", `Lead reply: ${input.leadReply}`);
  }

  if (input.allowPass) {
    sections.push(
      "",
      "Respond with JSON only.",
      'If you have meaningful new information, use {"kind":"message","text":"..."}',
      'If you add no meaningful value, use {"kind":"pass","reason":"..."}',
    );
  } else {
    sections.push(
      "",
      "Respond with JSON only.",
      'Use {"kind":"message","text":"..."}',
      "Do not output pass.",
    );
  }

  return sections.join("\n");
}
