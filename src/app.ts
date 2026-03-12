import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";

import { createDefaultAdapters, detectActiveAgents, type ActiveAgent } from "./adapters/registry.ts";
import { Orchestrator } from "./core/orchestrator.ts";
import type { ChatMessage } from "./core/types.ts";
import { FileStorage } from "./storage/file-store.ts";

type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; orchestrator: Orchestrator; agents: ActiveAgent[] }
  | { status: "error"; message: string };

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: "loading" });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [statusLine, setStatusLine] = useState("Booting...");

  useEffect(() => {
    let active = true;

    async function bootstrapApp(): Promise<void> {
      try {
        const adapters = createDefaultAdapters();
        const agents = await detectActiveAgents(adapters);
        const storage = new FileStorage();
        await storage.ensureReady();
        const orchestrator = await Orchestrator.create({
          storage,
          agents,
        });

        if (!active) {
          return;
        }

        setBootstrap({ status: "ready", orchestrator, agents });
        setMessages(orchestrator.visibleMessages);
        setStatusLine(buildStatusSummary(agents));
      } catch (error) {
        if (!active) {
          return;
        }

        setBootstrap({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    bootstrapApp();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setShowCursor((current) => !current);
    }, 530);

    return () => clearInterval(timer);
  }, []);

  useInput((chunk, key) => {
    if (key.ctrl && chunk.toLowerCase() === "c") {
      exit();
      return;
    }

    if (bootstrap.status !== "ready" || busy) {
      return;
    }

    const containsNewline = chunk.includes("\n") || chunk.includes("\r");
    const sanitizedChunk = chunk.replace(/[\r\n]+/g, "");

    if (key.return || containsNewline) {
      void submitMessage(input + sanitizedChunk);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && sanitizedChunk) {
      setInput((current) => current + sanitizedChunk);
    }
  });

  async function submitMessage(overrideValue?: string): Promise<void> {
    if (bootstrap.status !== "ready") {
      return;
    }

    const nextInput = (overrideValue ?? input).trim();

    if (!nextInput) {
      return;
    }

    if (nextInput === "/quit") {
      exit();
      return;
    }

    setBusy(true);
    setStatusLine("Waiting for agents...");

    try {
      const nextMessages = await bootstrap.orchestrator.submitUserMessage(nextInput);
      setMessages(nextMessages);
      setInput("");
      setStatusLine(buildStatusSummary(bootstrap.orchestrator.agents));
    } catch (error) {
      setStatusLine(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const content = renderContent({
    bootstrap,
    messages,
    input,
    busy,
    showCursor,
    statusLine,
  });

  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: 1, paddingY: 1 },
    content,
  );
}

function renderContent(input: {
  bootstrap: BootstrapState;
  messages: ChatMessage[];
  input: string;
  busy: boolean;
  showCursor: boolean;
  statusLine: string;
}): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  nodes.push(
    React.createElement(
      Box,
      { key: "header", flexDirection: "column", marginBottom: 1 },
      React.createElement(Text, { bold: true }, "Crosstalk"),
      React.createElement(Text, { color: "gray" }, input.statusLine),
    ),
  );

  if (input.bootstrap.status === "error") {
    nodes.push(
      React.createElement(
        Box,
        { key: "error", marginBottom: 1 },
        React.createElement(Text, { color: "red" }, input.bootstrap.message),
      ),
    );
  }

  if (input.bootstrap.status === "ready") {
    nodes.push(
      React.createElement(
        Box,
        { key: "agents", marginBottom: 1, flexWrap: "wrap" },
        input.bootstrap.agents.length > 0
          ? input.bootstrap.agents.map((agent) => renderAgentChip(agent))
          : React.createElement(Text, { color: "gray" }, "No detected agents."),
      ),
    );
  }

  const recentMessages = input.messages.slice(-14);

  nodes.push(
    React.createElement(
      Box,
      { key: "messages", flexDirection: "column", marginBottom: 1 },
      recentMessages.length > 0
        ? recentMessages.map((message) => renderMessageCard(message))
        : React.createElement(Text, { color: "gray" }, "No messages yet."),
    ),
  );

  nodes.push(
    React.createElement(
      Box,
      { key: "footer", flexDirection: "column" },
      React.createElement(
        Text,
        { color: "gray" },
        "Compose",
      ),
      React.createElement(
        Box,
        {
          borderStyle: "round",
          borderColor: input.busy ? "yellow" : "cyan",
          paddingX: 1,
          flexDirection: "column",
          marginBottom: 1,
        },
        React.createElement(
          Text,
          { color: input.busy ? "yellow" : "white" },
          `${input.input}${input.showCursor && !input.busy ? "▍" : " "}`,
        ),
      ),
      React.createElement(
        Text,
        { color: "gray" },
        "Enter to send. Use @codex, @claudecode, or @gemini. /quit to exit.",
      ),
    ),
  );

  return nodes;
}

function buildStatusSummary(agents: ActiveAgent[]): string {
  if (agents.length === 0) {
    return "No supported agents detected. Install Codex, Claude Code, or Gemini CLI.";
  }

  const unavailable = agents.filter((agent) => agent.availability === "unavailable");

  if (unavailable.length === 0) {
    return `Detected ${agents.map((agent) => `@${agent.id}`).join(", ")}`;
  }

  return `Detected ${agents.map((agent) => `@${agent.id}`).join(", ")} | unavailable: ${unavailable
    .map((agent) => `@${agent.id}`)
    .join(", ")}`;
}

function renderAgentChip(agent: ActiveAgent): React.ReactElement {
  const accent =
    agent.availability === "ready"
      ? { color: "green", label: "ready" }
      : { color: "red", label: "unavailable" };

  return React.createElement(
    Box,
    {
      key: agent.id,
      borderStyle: "round",
      borderColor: accent.color,
      paddingX: 1,
      marginRight: 1,
      marginBottom: 1,
    },
    React.createElement(
      Text,
      { color: accent.color },
      `@${agent.id} ${accent.label}`,
    ),
  );
}

function renderMessageCard(message: ChatMessage): React.ReactElement {
  if (message.role === "system") {
    return React.createElement(
      Box,
      { key: message.id, marginBottom: 1 },
      React.createElement(Text, { color: "yellow", dimColor: true }, `System  ${message.text}`),
    );
  }

  const appearance =
    message.authorId === "user"
      ? {
          borderColor: "gray",
          labelColor: "black",
          labelBackgroundColor: "gray",
          label: " You ",
          bodyColor: "white",
        }
      : getAgentAppearance(message.authorId);

  return React.createElement(
    Box,
    {
      key: message.id,
      borderStyle: "round",
      borderColor: appearance.borderColor,
      paddingX: 1,
      flexDirection: "column",
      marginBottom: 1,
    },
    React.createElement(
      Box,
      { marginBottom: 0 },
      React.createElement(
        Text,
        {
          bold: true,
          color: appearance.labelColor,
          backgroundColor: appearance.labelBackgroundColor,
        },
        appearance.label,
      ),
    ),
    React.createElement(Text, { color: appearance.bodyColor }, message.text),
  );
}

function getAgentAppearance(authorId: ChatMessage["authorId"]): {
  borderColor: string;
  labelColor: string;
  labelBackgroundColor: string;
  label: string;
  bodyColor: string;
} {
  switch (authorId) {
    case "codex":
      return {
        borderColor: "cyan",
        labelColor: "black",
        labelBackgroundColor: "cyan",
        label: " Codex ",
        bodyColor: "white",
      };
    case "claudecode":
      return {
        borderColor: "green",
        labelColor: "black",
        labelBackgroundColor: "green",
        label: " Claude ",
        bodyColor: "white",
      };
    case "gemini":
      return {
        borderColor: "yellow",
        labelColor: "black",
        labelBackgroundColor: "yellow",
        label: " Gemini ",
        bodyColor: "white",
      };
    default:
      return {
        borderColor: "white",
        labelColor: "black",
        labelBackgroundColor: "white",
        label: " Agent ",
        bodyColor: "white",
      };
  }
}
