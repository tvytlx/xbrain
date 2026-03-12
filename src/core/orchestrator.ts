import { createId } from "./ids.ts";
import { parseMentions } from "./mentions.ts";
import { buildAgentPrompt } from "./prompts.ts";
import { pickLead } from "./router.ts";
import { createEvent, deriveChatMessages } from "./transcript.ts";
import type {
  AgentFailedPayload,
  AgentId,
  AgentInvokedPayload,
  AssistantMessageCommittedPayload,
  AssistantPassedPayload,
  ChatMessage,
  EventEnvelope,
  LeadSelectedPayload,
  ParticipantSnapshot,
  SessionRecord,
  SessionSettings,
  UserMessageCommittedPayload,
} from "./types.ts";
import type { AgentResponse } from "../adapters/base.ts";
import type { ActiveAgent } from "../adapters/registry.ts";
import { FileStorage } from "../storage/file-store.ts";

const DEFAULT_TIMEOUT_MS = 45_000;

export class Orchestrator {
  #storage: FileStorage;
  #session: SessionRecord;
  #agents: ActiveAgent[];
  #events: EventEnvelope[];
  #turnNumber = 0;
  #lastLeadAgentId: AgentId | null = null;

  private constructor(input: {
    storage: FileStorage;
    session: SessionRecord;
    agents: ActiveAgent[];
    events: EventEnvelope[];
  }) {
    this.#storage = input.storage;
    this.#session = input.session;
    this.#agents = input.agents;
    this.#events = input.events;
  }

  static async create(input: {
    storage: FileStorage;
    agents: ActiveAgent[];
    settings?: Partial<SessionSettings>;
    title?: string;
  }): Promise<Orchestrator> {
    const settings: SessionSettings = {
      maxVisibleAiRepliesPerTurn: 2,
      challengerEnabled: true,
      cwd: process.cwd(),
      ...input.settings,
    };

    const participants: ParticipantSnapshot[] = [
      {
        id: "user",
        kind: "human",
        installed: true,
        enabled: true,
      },
      ...input.agents.map((agent) => ({
        id: agent.id,
        kind: "agent" as const,
        installed: true,
        enabled: agent.enabled,
        binary: agent.binary,
      })),
    ];

    const session = await input.storage.createSession({
      title: input.title ?? "Untitled session",
      participants,
      settings,
    });
    const orchestrator = new Orchestrator({
      storage: input.storage,
      session,
      agents: input.agents,
      events: [],
    });

    await orchestrator.#recordEvent(
      createEvent(session, "session_started", "system", "session", {
        participants: participants.map((participant) => participant.id),
      }),
    );

    return orchestrator;
  }

  get session(): SessionRecord {
    return this.#session;
  }

  get visibleMessages(): ChatMessage[] {
    return deriveChatMessages(this.#events);
  }

  get agents(): ActiveAgent[] {
    return [...this.#agents];
  }

  async submitUserMessage(text: string): Promise<ChatMessage[]> {
    const trimmed = text.trim();

    if (!trimmed) {
      return this.visibleMessages;
    }

    this.#turnNumber += 1;

    if (this.#session.title === "Untitled session") {
      this.#session.title = trimmed.slice(0, 60);
      await this.#storage.updateSession(this.#session);
    }

    const turnId = createId("turn");
    const userMessageId = createId("msg");
    const mentions = parseMentions(trimmed).filter((agentId) =>
      this.#agents.some((agent) => agent.id === agentId),
    );

    const userEvent = createEvent<UserMessageCommittedPayload>(
      this.#session,
      "user_message_committed",
      "user",
      turnId,
      {
        messageId: userMessageId,
        text: trimmed,
        mentions,
      },
    );
    const turnStartedEvent = createEvent(this.#session, "turn_started", "system", turnId, {});

    await this.#recordEvent(userEvent);
    await this.#recordEvent(turnStartedEvent);

    if (mentions.length > 0) {
      await this.#handleMentionedTurn(turnId, userMessageId, trimmed, mentions);
    } else {
      await this.#handleAutomaticTurn(turnId, userMessageId, trimmed);
    }

    const turnCompleted = createEvent(this.#session, "turn_completed", "system", turnId, {});
    await this.#recordEvent(turnCompleted);
    await this.#storage.updateSession(this.#session);

    return this.visibleMessages;
  }

  async #handleMentionedTurn(
    turnId: string,
    replyToMessageId: string,
    userText: string,
    mentions: AgentId[],
  ): Promise<void> {
    for (const [index, agentId] of mentions.entries()) {
      const agent = this.#agents.find((item) => item.id === agentId);

      if (!agent) {
        continue;
      }

      if (!this.#isAgentReady(agent)) {
        await this.#recordUnavailableAgentEvent({
          agent,
          turnId,
          roleInTurn: index === 0 ? "lead" : "challenger",
        });
        continue;
      }

      const response = await this.#invokeAgent({
        agent,
        turnId,
        replyToMessageId,
        userText,
        roleInTurn: index === 0 ? "lead" : "challenger",
        allowPass: false,
      });

      if (response.kind === "message") {
        replyToMessageId = response.messageId;
      }
    }
  }

  async #handleAutomaticTurn(
    turnId: string,
    replyToMessageId: string,
    userText: string,
  ): Promise<void> {
    const leadChoice = pickLead(this.#agents, userText, {
      turnNumber: this.#turnNumber,
      lastLeadAgentId: this.#lastLeadAgentId,
    });

    if (!leadChoice.agentId) {
      return;
    }

    await this.#recordEvent(
      createEvent<LeadSelectedPayload>(this.#session, "lead_selected", "system", turnId, {
        agentId: leadChoice.agentId,
        reason: "highest_weighted_score",
        intent: leadChoice.intent,
        scores: leadChoice.scores,
      }),
    );

    const candidates = leadChoice.scores
      .map((score) => this.#agents.find((agent) => agent.id === score.agentId))
      .filter(Boolean) as ActiveAgent[];

    let leadMessageText: string | undefined;
    let leadAgentId: AgentId | null = null;

    for (const candidate of candidates) {
      const response = await this.#invokeAgent({
        agent: candidate,
        turnId,
        replyToMessageId,
        userText,
        roleInTurn: "lead",
        allowPass: false,
        intentOverride: leadChoice.intent,
      });

      if (response.kind === "message") {
        replyToMessageId = response.messageId;
        leadMessageText = response.text;
        leadAgentId = candidate.id;
        this.#lastLeadAgentId = candidate.id;
        break;
      }
    }

    if (!leadMessageText || !leadAgentId || !this.#session.settings.challengerEnabled) {
      return;
    }

    const challenger = candidates.find((candidate) => candidate.id !== leadAgentId);

    if (!challenger) {
      return;
    }

    await this.#invokeAgent({
      agent: challenger,
      turnId,
      replyToMessageId,
      userText,
      roleInTurn: "challenger",
      allowPass: true,
      leadReply: leadMessageText,
      intentOverride: leadChoice.intent,
    });
  }

  async #invokeAgent(input: {
    agent: ActiveAgent;
    turnId: string;
    replyToMessageId: string;
    userText: string;
    roleInTurn: "lead" | "challenger";
    allowPass: boolean;
    leadReply?: string;
    intentOverride?: string;
  }): Promise<
    | { kind: "message"; text: string; messageId: string }
    | { kind: "pass" }
    | { kind: "failure" }
  > {
    if (!this.#isAgentReady(input.agent)) {
      await this.#recordUnavailableAgentEvent({
        agent: input.agent,
        turnId: input.turnId,
        roleInTurn: input.roleInTurn,
      });
      return { kind: "failure" };
    }

    await this.#recordEvent(
      createEvent<AgentInvokedPayload>(this.#session, "agent_invoked", "system", input.turnId, {
        agentId: input.agent.id,
        roleInTurn: input.roleInTurn,
        allowPass: input.allowPass,
      }),
    );

    const prompt = buildAgentPrompt({
      agentId: input.agent.id,
      roleInTurn: input.roleInTurn,
      intent: (input.intentOverride as any) ?? "analysis",
      userText: input.userText,
      history: this.visibleMessages,
      allowPass: input.allowPass,
      leadReply: input.leadReply,
    });
    const response = await input.agent.adapter.invoke({
      agentId: input.agent.id,
      roleInTurn: input.roleInTurn,
      prompt,
      cwd: this.#session.settings.cwd,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      allowPass: input.allowPass,
    });

    return this.#recordAgentResponse({
      agent: input.agent,
      turnId: input.turnId,
      replyToMessageId: input.replyToMessageId,
      roleInTurn: input.roleInTurn,
      response,
    });
  }

  async #recordAgentResponse(input: {
    agent: ActiveAgent;
    turnId: string;
    replyToMessageId: string;
    roleInTurn: "lead" | "challenger";
    response: AgentResponse;
  }): Promise<
    | { kind: "message"; text: string; messageId: string }
    | { kind: "pass" }
    | { kind: "failure" }
  > {
    this.#updateLatency(input.agent, input.response.durationMs);

    if (input.response.kind === "message") {
      const messageId = createId("msg");
      const event = createEvent<AssistantMessageCommittedPayload>(
        this.#session,
        "assistant_message_committed",
        input.agent.id,
        input.turnId,
        {
          messageId,
          agentId: input.agent.id,
          roleInTurn: input.roleInTurn,
          text: input.response.text,
          replyToMessageId: input.replyToMessageId,
          durationMs: input.response.durationMs,
        },
      );

      input.agent.lastSpokeTurn = this.#turnNumber;

      if (input.roleInTurn === "lead") {
        input.agent.lastLeadTurn = this.#turnNumber;
      }

      await this.#recordEvent(event);
      return { kind: "message", text: input.response.text, messageId };
    }

    if (input.response.kind === "pass") {
      const nextPassRate = Math.min(1, input.agent.recentPassRate * 0.6 + 0.4);
      input.agent.recentPassRate = nextPassRate;

      const event = createEvent<AssistantPassedPayload>(
        this.#session,
        "assistant_passed",
        input.agent.id,
        input.turnId,
        {
          agentId: input.agent.id,
          roleInTurn: input.roleInTurn,
          reason: input.response.reason,
          replyToMessageId: input.replyToMessageId,
          durationMs: input.response.durationMs,
        },
      );

      await this.#recordEvent(event);
      return { kind: "pass" };
    }

    const markedUnavailable = this.#shouldMarkAgentUnavailable(input.response.error);

    if (markedUnavailable) {
      this.#markAgentUnavailable(input.agent, input.response.error);
    }

    const event = createEvent<AgentFailedPayload>(this.#session, "agent_failed", input.agent.id, input.turnId, {
      agentId: input.agent.id,
      roleInTurn: input.roleInTurn,
      error: input.response.error,
      durationMs: input.response.durationMs,
      markedUnavailable,
    });

    await this.#recordEvent(event);
    return { kind: "failure" };
  }

  #isAgentReady(agent: ActiveAgent): boolean {
    return agent.enabled && agent.availability === "ready";
  }

  #markAgentUnavailable(agent: ActiveAgent, reason: string): void {
    agent.availability = "unavailable";
    agent.unavailableReason = this.#summarizeError(reason);
  }

  #summarizeError(error: string): string {
    return error
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 200) ?? "Unavailable.";
  }

  #shouldMarkAgentUnavailable(error: string): boolean {
    const normalized = error.toLowerCase();

    return [
      "not installed",
      "not logged in",
      "403",
      "forbidden",
      "disabled in this account",
      "refresh token",
      "could not be refreshed",
      "error authenticating",
      "connection refused",
      "econnrefused",
      "service unavailable",
      "approval mode",
      "process timed out",
      "timed out",
    ].some((pattern) => normalized.includes(pattern));
  }

  async #recordUnavailableAgentEvent(input: {
    agent: ActiveAgent;
    turnId: string;
    roleInTurn: "lead" | "challenger";
  }): Promise<void> {
    await this.#recordEvent(
      createEvent<AgentFailedPayload>(this.#session, "agent_failed", input.agent.id, input.turnId, {
        agentId: input.agent.id,
        roleInTurn: input.roleInTurn,
        error: input.agent.unavailableReason ?? "Agent is unavailable.",
        durationMs: 0,
        markedUnavailable: true,
      }),
    );
  }

  #updateLatency(agent: ActiveAgent, durationMs: number): void {
    if (durationMs <= 0) {
      return;
    }

    if (agent.avgLatencyMs <= 0) {
      agent.avgLatencyMs = durationMs;
      return;
    }

    agent.avgLatencyMs = Math.round(agent.avgLatencyMs * 0.7 + durationMs * 0.3);
  }

  async #recordEvent(event: EventEnvelope): Promise<void> {
    this.#events.push(event);
    await this.#storage.appendEvent(event);
  }
}
