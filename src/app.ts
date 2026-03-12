import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";

import {
  createDefaultAdapters,
  detectActiveAgents,
  type ActiveAgent,
} from "./adapters/registry.ts";
import { createId } from "./core/ids.ts";
import { Orchestrator } from "./core/orchestrator.ts";
import type { AgentId, ChatMessage } from "./core/types.ts";
import { createConversationScreenshot } from "./share/screenshot.ts";
import { FileStorage } from "./storage/file-store.ts";
import { formatThinkingIndicator, reduceThinkingAgents } from "./ui/typing-indicator.ts";

type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; orchestrator: Orchestrator; agents: ActiveAgent[] }
  | { status: "error"; message: string };

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: "loading" });
  const [input, setInput] = useState("");
  const [localNotice, setLocalNotice] = useState<{
    id: string;
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinkingAgents, setThinkingAgents] = useState<AgentId[]>([]);
  const [busy, setBusy] = useState(false);
  const [typingFrame, setTypingFrame] = useState(0);
  const [statusLine, setStatusLine] = useState("Booting...");

  useEffect(() => {
    let active = true;

    async function bootstrapApp(): Promise<void> {
      try {
        setStatusLine("Checking installed CLIs...");
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
      setTypingFrame((current) => (current + 1) % 3);
    }, 420);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!localNotice) {
      return;
    }

    const timer = setTimeout(() => {
      setLocalNotice((current) => (current?.id === localNotice.id ? null : current));
    }, 4_500);

    return () => clearTimeout(timer);
  }, [localNotice]);

  useEffect(() => {
    if (bootstrap.status !== "ready") {
      return;
    }

    return bootstrap.orchestrator.subscribe((event) => {
      setMessages(bootstrap.orchestrator.visibleMessages);
      setThinkingAgents((current) => reduceThinkingAgents(current, event));
      setStatusLine(buildStatusSummary(bootstrap.orchestrator.agents));
    });
  }, [bootstrap]);

  useInput((chunk, key) => {
    if (key.ctrl && chunk.toLowerCase() === "c") {
      exit();
    }
  });

  function pushLocalNotice(text: string, tone: "success" | "error"): void {
    setLocalNotice({
      id: createId("notice"),
      tone,
      text,
    });
  }

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

    if (nextInput === "/screenshot") {
      setInput("");
      setBusy(true);
      setStatusLine("Preparing screenshot...");

      try {
        await createConversationScreenshot(messages);
        pushLocalNotice("Screenshot copied to clipboard.", "success");
        setStatusLine(buildStatusSummary(bootstrap.orchestrator.agents));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushLocalNotice(message, "error");
        setStatusLine(message);
      } finally {
        setBusy(false);
      }

      return;
    }

    setInput("");
    setThinkingAgents([]);
    setBusy(true);
    setStatusLine(buildStatusSummary(bootstrap.orchestrator.agents));

    try {
      const nextMessages = await bootstrap.orchestrator.submitUserMessage(nextInput);
      setMessages(nextMessages);
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
    typingFrame,
    thinkingAgents,
    localNotice,
    statusLine,
    onInputChange: setInput,
    onSubmit: submitMessage,
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
  typingFrame: number;
  thinkingAgents: AgentId[];
  localNotice: { id: string; tone: "success" | "error"; text: string } | null;
  statusLine: string;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
}): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  nodes.push(
    React.createElement(
      Box,
      { key: "header", flexDirection: "column", marginBottom: 1 },
      React.createElement(Text, { bold: true }, "XBrain"),
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

  const thinkingLabel = formatThinkingIndicator(input.thinkingAgents, input.typingFrame);

  if (thinkingLabel) {
    nodes.push(
      React.createElement(
        Box,
        {
          key: "typing-indicator",
          borderStyle: "round",
          borderColor: "magenta",
          paddingX: 1,
          marginBottom: 1,
        },
        React.createElement(Text, { color: "magenta" }, thinkingLabel),
      ),
    );
  }

  if (input.localNotice) {
    const noticeColor = input.localNotice.tone === "success" ? "green" : "red";
    nodes.push(
      React.createElement(
        Box,
        {
          key: input.localNotice.id,
          borderStyle: "round",
          borderColor: noticeColor,
          paddingX: 1,
          marginBottom: 1,
        },
        React.createElement(Text, { color: noticeColor }, input.localNotice.text),
      ),
    );
  }

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
          borderColor: input.busy ? "gray" : "cyan",
          paddingX: 1,
          marginBottom: 1,
        },
        React.createElement(
          TextInput,
          {
            value: input.input,
            onChange: input.onInputChange,
            onSubmit: (value: string) => {
              void input.onSubmit(value);
            },
            placeholder: input.busy ? "" : "typing and asking xbrain",
            focus: input.bootstrap.status === "ready" && !input.busy,
            showCursor: !input.busy,
          },
        ),
      ),
      React.createElement(
        Text,
        { color: "gray" },
        "Enter to send. Use @codex, @claudecode, or @gemini. /screenshot exports a share image. /quit or Ctrl+C to exit.",
      ),
    ),
  );

  return nodes;
}

function buildStatusSummary(agents: ActiveAgent[]): string {
  if (agents.length === 0) {
    return "No supported agents detected. Install Codex, Claude Code, or Gemini CLI.";
  }

  const unknown = agents.filter((agent) => agent.availability === "unknown");
  const unavailable = agents.filter((agent) => agent.availability === "unavailable");

  if (unknown.length === 0 && unavailable.length === 0) {
    return `Detected ${agents.map((agent) => `@${agent.id}`).join(", ")}`;
  }

  const segments = [`Detected ${agents.map((agent) => `@${agent.id}`).join(", ")}`];

  if (unknown.length > 0) {
    segments.push(`checking on first use: ${unknown.map((agent) => `@${agent.id}`).join(", ")}`);
  }

  if (unavailable.length > 0) {
    segments.push(`unavailable: ${unavailable.map((agent) => `@${agent.id}`).join(", ")}`);
  }

  return segments.join(" | ");
}

function renderAgentChip(agent: ActiveAgent): React.ReactElement {
  const accent =
    agent.availability === "ready"
      ? { color: "green", label: "ready" }
      : agent.availability === "unknown"
        ? { color: "yellow", label: "idle" }
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
          borderColor: "white",
          labelColor: "black",
          labelBackgroundColor: "white",
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
        borderColor: "blue",
        labelColor: "white",
        labelBackgroundColor: "blue",
        label: " Codex ",
        bodyColor: "white",
      };
    case "claudecode":
      return {
        borderColor: "yellow",
        labelColor: "white",
        labelBackgroundColor: "yellow",
        label: " Claude ",
        bodyColor: "white",
      };
    case "gemini":
      return {
        borderColor: "magenta",
        labelColor: "white",
        labelBackgroundColor: "magenta",
        label: " Gemini ",
        bodyColor: "white",
      };
    default:
      return {
        borderColor: "white",
        labelColor: "white",
        labelBackgroundColor: "gray",
        label: " Agent ",
        bodyColor: "white",
      };
  }
}
