import { createId } from "./ids.ts";
import type {
  AssistantMessageCommittedPayload,
  ChatMessage,
  EventEnvelope,
  SessionRecord,
  UserMessageCommittedPayload,
} from "./types.ts";

export function createEvent<TPayload>(
  session: SessionRecord,
  kind: EventEnvelope<TPayload>["kind"],
  actorId: EventEnvelope<TPayload>["actorId"],
  turnId: string,
  payload: TPayload,
): EventEnvelope<TPayload> {
  const seq = session.lastSeq + 1;
  session.lastSeq = seq;
  session.updatedAt = new Date().toISOString();

  return {
    id: createId("evt"),
    sessionId: session.id,
    seq,
    ts: new Date().toISOString(),
    kind,
    actorId,
    turnId,
    payload,
  };
}

export function deriveChatMessages(events: EventEnvelope[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const event of events) {
    switch (event.kind) {
      case "user_message_committed": {
        const payload = event.payload as UserMessageCommittedPayload;
        messages.push({
          id: payload.messageId,
          turnId: event.turnId,
          authorId: "user",
          role: "user",
          text: payload.text,
          visible: true,
        });
        break;
      }
      case "assistant_message_committed": {
        const payload = event.payload as AssistantMessageCommittedPayload;
        messages.push({
          id: payload.messageId,
          turnId: event.turnId,
          authorId: payload.agentId,
          role: "assistant",
          text: payload.text,
          visible: true,
        });
        break;
      }
      case "agent_failed": {
        const payload = event.payload as {
          agentId: string;
          error: string;
          markedUnavailable?: boolean;
        };
        const prefix = payload.markedUnavailable
          ? `${payload.agentId} is now unavailable`
          : `${payload.agentId} failed`;
        messages.push({
          id: createId("msg"),
          turnId: event.turnId,
          authorId: "system",
          role: "system",
          text: `${prefix}: ${payload.error}`,
          visible: true,
        });
        break;
      }
      default:
        break;
    }
  }

  return messages;
}
