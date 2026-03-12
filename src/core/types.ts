export const AGENT_IDS = ["codex", "claudecode", "gemini"] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type ParticipantId = AgentId | "user" | "system";
export type Intent = "coding" | "analysis" | "ideation" | "critique";
export type AgentRoleInTurn = "lead" | "challenger";
export type AgentAvailability = "ready" | "unavailable";

export type CapabilityProfile = Record<Intent, number>;

export type ParticipantSnapshot = {
  id: ParticipantId;
  kind: "human" | "agent" | "system";
  installed: boolean;
  enabled: boolean;
  binary?: string;
};

export type SessionSettings = {
  maxVisibleAiRepliesPerTurn: number;
  challengerEnabled: boolean;
  cwd: string;
};

export type SessionRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  participants: ParticipantSnapshot[];
  settings: SessionSettings;
  lastSeq: number;
};

export type EventKind =
  | "session_started"
  | "user_message_committed"
  | "turn_started"
  | "lead_selected"
  | "agent_invoked"
  | "assistant_message_committed"
  | "assistant_passed"
  | "agent_failed"
  | "turn_completed";

export type EventEnvelope<TPayload = Record<string, unknown>> = {
  id: string;
  sessionId: string;
  seq: number;
  ts: string;
  kind: EventKind;
  actorId: ParticipantId;
  turnId: string;
  payload: TPayload;
};

export type UserMessageCommittedPayload = {
  messageId: string;
  text: string;
  mentions: AgentId[];
};

export type LeadSelectedPayload = {
  agentId: AgentId;
  reason: string;
  intent: Intent;
  scores: Array<{ agentId: AgentId; score: number }>;
};

export type AgentInvokedPayload = {
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  allowPass: boolean;
};

export type AssistantMessageCommittedPayload = {
  messageId: string;
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  text: string;
  replyToMessageId: string;
  durationMs: number;
};

export type AssistantPassedPayload = {
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  reason: string;
  replyToMessageId: string;
  durationMs: number;
};

export type AgentFailedPayload = {
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  error: string;
  durationMs: number;
  markedUnavailable: boolean;
};

export type ChatMessage = {
  id: string;
  turnId: string;
  authorId: ParticipantId;
  role: "user" | "assistant" | "system";
  text: string;
  visible: boolean;
};

export type AgentRuntimeState = {
  id: AgentId;
  enabled: boolean;
  binary: string;
  availability: AgentAvailability;
  unavailableReason?: string;
  capabilityProfile: CapabilityProfile;
  avgLatencyMs: number;
  recentPassRate: number;
  lastLeadTurn: number | null;
  lastSpokeTurn: number | null;
};

export type LeadScore = {
  agentId: AgentId;
  score: number;
};

export type TurnSnapshot = {
  turnNumber: number;
  lastLeadAgentId: AgentId | null;
};
