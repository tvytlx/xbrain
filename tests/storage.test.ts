import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createId } from "../src/core/ids.ts";
import { FileStorage } from "../src/storage/file-store.ts";

test("file storage appends and loads events", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "xbrain-storage-"));
  const storage = new FileStorage(baseDir);
  await storage.ensureReady();

  const session = await storage.createSession({
    title: "Test session",
    participants: [],
    settings: {
      cwd: process.cwd(),
      challengerEnabled: true,
      maxVisibleAiRepliesPerTurn: 2,
    },
  });

  await storage.appendEvent({
    id: createId("evt"),
    sessionId: session.id,
    seq: 1,
    ts: new Date().toISOString(),
    kind: "turn_started",
    actorId: "system",
    turnId: "turn_1",
    payload: {},
  });

  const events = await storage.loadEvents(session.id);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "turn_started");
});
