import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

import { createId } from "../core/ids.ts";
import type {
  EventEnvelope,
  ParticipantSnapshot,
  SessionRecord,
  SessionSettings,
} from "../core/types.ts";

export class FileStorage {
  readonly baseDir: string;
  readonly eventsDir: string;
  readonly sessionsIndexPath: string;

  constructor(baseDir = join(process.cwd(), "data")) {
    this.baseDir = baseDir;
    this.eventsDir = join(baseDir, "events");
    this.sessionsIndexPath = join(baseDir, "sessions.json");
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.eventsDir, { recursive: true });

    try {
      await readFile(this.sessionsIndexPath, "utf8");
    } catch {
      await writeFile(this.sessionsIndexPath, "[]\n", "utf8");
    }
  }

  async createSession(input: {
    title: string;
    participants: ParticipantSnapshot[];
    settings: SessionSettings;
  }): Promise<SessionRecord> {
    await this.ensureReady();

    const session: SessionRecord = {
      id: createId("session"),
      title: input.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: input.participants,
      settings: input.settings,
      lastSeq: 0,
    };

    await this.#upsertSession(session);

    return session;
  }

  async updateSession(session: SessionRecord): Promise<void> {
    await this.#upsertSession(session);
  }

  async appendEvent(event: EventEnvelope): Promise<void> {
    await this.ensureReady();
    await appendFile(
      join(this.eventsDir, `${event.sessionId}.jsonl`),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
  }

  async loadEvents(sessionId: string): Promise<EventEnvelope[]> {
    try {
      const raw = await readFile(join(this.eventsDir, `${sessionId}.jsonl`), "utf8");

      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as EventEnvelope);
    } catch {
      return [];
    }
  }

  async #upsertSession(session: SessionRecord): Promise<void> {
    await this.ensureReady();
    const sessions = await this.#readSessions();
    const next = sessions.filter((item) => item.id !== session.id);
    next.push(session);
    next.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    await writeFile(this.sessionsIndexPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  async #readSessions(): Promise<SessionRecord[]> {
    const raw = await readFile(this.sessionsIndexPath, "utf8");
    return JSON.parse(raw) as SessionRecord[];
  }
}
