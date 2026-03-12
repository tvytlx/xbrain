import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Resvg } from "@resvg/resvg-js";
import stringWidth from "string-width";

import type { ChatMessage } from "../core/types.ts";

const execFileAsync = promisify(execFile);

const CARD_WIDTH = 1280;
const OUTER_PADDING = 52;
const HEADER_HEIGHT = 92;
const FOOTER_HEIGHT = 96;
const MESSAGE_GAP = 20;
const MESSAGE_HORIZONTAL_PADDING = 22;
const MESSAGE_VERTICAL_PADDING = 18;
const LABEL_HEIGHT = 34;
const LABEL_TO_TEXT_GAP = 26;
const LINE_HEIGHT = 31;
const BODY_FONT_SIZE = 25;
const LABEL_FONT_SIZE = 20;
const APPROX_CHAR_WIDTH = 13.4;
const INNER_WIDTH = CARD_WIDTH - OUTER_PADDING * 2;
const MAX_AI_BUBBLE_WIDTH = Math.floor(INNER_WIDTH * 0.78);
const MAX_USER_BUBBLE_WIDTH = Math.floor(INNER_WIDTH * 0.52);
const MONO_FONT_FAMILY = "Menlo, Monaco, 'SF Mono', 'Courier New', monospace";
const CJK_FONT_FAMILY =
  "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif";
const CTA_TEXT = "Install: npm install -g xbrain";
const CTA_WIDTH = Math.max(330, Math.ceil(stringWidth(CTA_TEXT) * 13.5 + 34));

type ShareMessage = {
  id: string;
  label: string;
  lines: string[];
  accent: string;
  labelFill: string;
  labelText: string;
  align: "left" | "right";
  bodyFontFamily: string;
  bubbleWidth: number;
  bubbleHeight: number;
};

export async function createConversationScreenshot(messages: ChatMessage[]): Promise<void> {
  const svg = renderConversationSvg(messages);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: CARD_WIDTH,
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "PingFang SC",
    },
  });
  const pngData = resvg.render().asPng();

  if (process.platform !== "darwin") {
    throw new Error("Clipboard image export is currently supported on macOS only.");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "xbrain-screenshot-"));
  const pngPath = join(tempDir, "conversation.png");

  try {
    await writeFile(pngPath, pngData);
    await copyPngToClipboard(pngPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function renderConversationSvg(messages: ChatMessage[]): string {
  const shareMessages = buildShareMessages(messages);

  if (shareMessages.length === 0) {
    throw new Error("No user or AI messages to capture yet.");
  }

  let y = OUTER_PADDING + HEADER_HEIGHT;
  const renderedMessages = shareMessages.map((message) => {
    const bubbleX =
      message.align === "right"
        ? CARD_WIDTH - OUTER_PADDING - message.bubbleWidth
        : OUTER_PADDING;
    const bubbleY = y;
    y += message.bubbleHeight + MESSAGE_GAP;

    const lineNodes = message.lines
      .map((line, index) => {
        const textY =
          bubbleY + MESSAGE_VERTICAL_PADDING + LABEL_HEIGHT + LABEL_TO_TEXT_GAP + index * LINE_HEIGHT;
        return `<text x="${bubbleX + MESSAGE_HORIZONTAL_PADDING}" y="${textY}" fill="#F9FAFB" font-size="${BODY_FONT_SIZE}" font-family="${message.bodyFontFamily}">${escapeXml(line)}</text>`;
      })
      .join("");

    return `
      <g>
        <rect x="${bubbleX}" y="${bubbleY}" width="${message.bubbleWidth}" height="${message.bubbleHeight}" rx="22" fill="#0F172A" stroke="${message.accent}" stroke-width="3" />
        <rect x="${bubbleX + MESSAGE_HORIZONTAL_PADDING}" y="${bubbleY + 16}" width="${Math.max(
          110,
          Math.ceil(stringWidth(message.label) * 14 + 26),
        )}" height="${LABEL_HEIGHT}" rx="12" fill="${message.labelFill}" />
        <text x="${bubbleX + MESSAGE_HORIZONTAL_PADDING + 16}" y="${bubbleY + 39}" fill="${message.labelText}" font-size="${LABEL_FONT_SIZE}" font-weight="700" font-family="${MONO_FONT_FAMILY}">${escapeXml(message.label)}</text>
        ${lineNodes}
      </g>
    `;
  });

  const footerY = y + 6;
  const totalHeight = footerY + FOOTER_HEIGHT + OUTER_PADDING;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${totalHeight}" viewBox="0 0 ${CARD_WIDTH} ${totalHeight}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#020617" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
      </defs>

      <rect width="${CARD_WIDTH}" height="${totalHeight}" fill="url(#bg)" />
      <rect x="${OUTER_PADDING}" y="${OUTER_PADDING}" width="${CARD_WIDTH - OUTER_PADDING * 2}" height="${totalHeight - OUTER_PADDING * 2}" rx="28" fill="#0B1120" stroke="#1F2937" stroke-width="2" />

      <g>
        <circle cx="${OUTER_PADDING + 28}" cy="${OUTER_PADDING + 28}" r="8" fill="#FB7185" />
        <circle cx="${OUTER_PADDING + 52}" cy="${OUTER_PADDING + 28}" r="8" fill="#FBBF24" />
        <circle cx="${OUTER_PADDING + 76}" cy="${OUTER_PADDING + 28}" r="8" fill="#34D399" />
      </g>

      <text x="${OUTER_PADDING}" y="${OUTER_PADDING + 60}" fill="#F8FAFC" font-size="38" font-weight="800" font-family="${MONO_FONT_FAMILY}">XBrain</text>
      <text x="${OUTER_PADDING}" y="${OUTER_PADDING + 84}" fill="#94A3B8" font-size="18" font-family="${MONO_FONT_FAMILY}">Multi-AI chat that thinks in public</text>

      ${renderedMessages.join("")}

      <g>
        <rect x="${OUTER_PADDING}" y="${footerY}" width="${CARD_WIDTH - OUTER_PADDING * 2}" height="${FOOTER_HEIGHT}" rx="22" fill="#0F172A" stroke="#334155" stroke-width="2" />
        <text x="${OUTER_PADDING + 24}" y="${footerY + 36}" fill="#F8FAFC" font-size="20" font-weight="700" font-family="${MONO_FONT_FAMILY}">Multi-AI chat for thinking in public</text>
        <rect x="${OUTER_PADDING + 24}" y="${footerY + 50}" width="${CTA_WIDTH}" height="34" rx="11" fill="#1D4ED8" />
        <text x="${OUTER_PADDING + 42}" y="${footerY + 73}" fill="#FFFFFF" font-size="18" font-weight="700" font-family="${MONO_FONT_FAMILY}">${CTA_TEXT}</text>
      </g>
    </svg>
  `.trim();
}

function buildShareMessages(messages: ChatMessage[]): ShareMessage[] {
  return messages
    .filter((message) => message.visible && message.role !== "system")
    .map((message) => {
      const appearance = getShareAppearance(message);
      const maxBubbleWidth =
        appearance.align === "right" ? MAX_USER_BUBBLE_WIDTH : MAX_AI_BUBBLE_WIDTH;
      const maxTextColumns = Math.floor(
        (maxBubbleWidth - MESSAGE_HORIZONTAL_PADDING * 2) / APPROX_CHAR_WIDTH,
      );
      const lines = wrapText(message.text, maxTextColumns);
      const widestLineWidth = Math.max(...lines.map((line) => stringWidth(line)), stringWidth(appearance.label));
      const bubbleWidth = Math.min(
        maxBubbleWidth,
        Math.max(
          appearance.align === "right" ? 240 : 280,
          Math.ceil(widestLineWidth * APPROX_CHAR_WIDTH + MESSAGE_HORIZONTAL_PADDING * 2),
        ),
      );
      const bubbleHeight =
        MESSAGE_VERTICAL_PADDING * 2 +
        LABEL_HEIGHT +
        LABEL_TO_TEXT_GAP +
        Math.max(1, lines.length) * LINE_HEIGHT;

      return {
        id: message.id,
        label: appearance.label,
        lines,
        accent: appearance.accent,
        labelFill: appearance.labelFill,
        labelText: appearance.labelText,
        align: appearance.align,
        bodyFontFamily: getBodyFontFamily(message.text),
        bubbleWidth,
        bubbleHeight,
      };
    });
}

function wrapText(text: string, maxColumns: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";

    for (const token of tokenizeParagraph(paragraph)) {
      if (token.trim().length === 0) {
        if (current.length > 0 && stringWidth(current + token) <= maxColumns) {
          current += token;
        }

        continue;
      }

      if (stringWidth(token) > maxColumns) {
        const fragments = breakLongToken(token, maxColumns);

        for (const fragment of fragments) {
          if (current.length === 0) {
            current = fragment;
            continue;
          }

          if (stringWidth(current + fragment) <= maxColumns) {
            current += fragment;
            continue;
          }

          lines.push(current.trimEnd());
          current = fragment;
        }

        continue;
      }

      const candidate = current + token;

      if (current.length > 0 && stringWidth(candidate) > maxColumns) {
        lines.push(current.trimEnd());
        current = token.trimStart();
      } else {
        current = candidate;
      }
    }

    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [""];
}

function getShareAppearance(message: ChatMessage): {
  label: string;
  accent: string;
  labelFill: string;
  labelText: string;
  align: "left" | "right";
} {
  if (message.authorId === "user") {
    return {
      label: "You",
      accent: "#F8FAFC",
      labelFill: "#F8FAFC",
      labelText: "#020617",
      align: "right",
    };
  }

  switch (message.authorId) {
    case "codex":
      return {
        label: "Codex",
        accent: "#3B82F6",
        labelFill: "#3B82F6",
        labelText: "#FFFFFF",
        align: "left",
      };
    case "claudecode":
      return {
        label: "Claude",
        accent: "#F59E0B",
        labelFill: "#F59E0B",
        labelText: "#FFFFFF",
        align: "left",
      };
    case "gemini":
      return {
        label: "Gemini",
        accent: "#A855F7",
        labelFill: "#A855F7",
        labelText: "#FFFFFF",
        align: "left",
      };
    default:
      return {
        label: "Agent",
        accent: "#94A3B8",
        labelFill: "#475569",
        labelText: "#FFFFFF",
        align: "left",
      };
  }
}

function getBodyFontFamily(text: string): string {
  return containsCjk(text) ? CJK_FONT_FAMILY : MONO_FONT_FAMILY;
}

function tokenizeParagraph(paragraph: string): string[] {
  const tokens: string[] = [];
  let asciiBuffer = "";
  let whitespaceBuffer = "";

  const flushAscii = (): void => {
    if (asciiBuffer.length > 0) {
      tokens.push(asciiBuffer);
      asciiBuffer = "";
    }
  };

  const flushWhitespace = (): void => {
    if (whitespaceBuffer.length > 0) {
      tokens.push(whitespaceBuffer);
      whitespaceBuffer = "";
    }
  };

  for (const character of Array.from(paragraph)) {
    if (/\s/.test(character)) {
      flushAscii();
      whitespaceBuffer += character;
      continue;
    }

    flushWhitespace();

    if (isWideCharacter(character)) {
      flushAscii();
      tokens.push(character);
      continue;
    }

    asciiBuffer += character;
  }

  flushAscii();
  flushWhitespace();

  return tokens;
}

function breakLongToken(token: string, maxColumns: number): string[] {
  const fragments: string[] = [];
  let current = "";

  for (const character of Array.from(token)) {
    if (current.length > 0 && stringWidth(current + character) > maxColumns) {
      fragments.push(current);
      current = character;
    } else {
      current += character;
    }
  }

  if (current.length > 0) {
    fragments.push(current);
  }

  return fragments;
}

function isWideCharacter(character: string): boolean {
  return stringWidth(character) > 1;
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(text);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function copyPngToClipboard(pngPath: string): Promise<void> {
  const script = `set the clipboard to (read (POSIX file "${pngPath}") as «class PNGf»)`;
  await execFileAsync("osascript", ["-e", script]);
}
