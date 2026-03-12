import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import type { AgentAdapter, AgentInvocation, AgentResponse } from "./base.ts";
import type { AgentId, CapabilityProfile } from "../core/types.ts";

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

type CommandSpec = {
  command: string;
  args: string[];
  stdin?: string;
  outputFile?: string;
};

async function commandExists(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const result = await runProcess(candidate, ["--help"], process.cwd(), 3_000);

    if (result.exitCode === 0) {
      return candidate;
    }
  }

  return null;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  stdin?: string,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (exitCode: number) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      resolve({
        stdout,
        stderr,
        exitCode,
        durationMs: Date.now() - startedAt,
      });
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      stderr += error.message;
      finish(1);
    });

    child.on("close", (code) => {
      finish(code ?? 1);
    });

    if (stdin) {
      child.stdin.write(stdin);
    }

    child.stdin.end();

    timeout = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += "\nProcess timed out.";
      finish(124);
    }, timeoutMs);
  });
}

function parseStructuredOutput(
  output: string,
  allowPass: boolean,
  durationMs: number,
): AgentResponse {
  const trimmed = output.trim();

  if (trimmed.length === 0) {
    return {
      kind: "failure",
      error: "Agent returned empty output.",
      durationMs,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      kind?: string;
      text?: string;
      reason?: string;
    };

    if (parsed.kind === "message" && parsed.text) {
      return {
        kind: "message",
        text: parsed.text.trim(),
        durationMs,
      };
    }

    if (parsed.kind === "pass" && allowPass) {
      return {
        kind: "pass",
        reason: parsed.reason?.trim() || "No substantial addition.",
        durationMs,
      };
    }
  } catch {
    return {
      kind: "failure",
      error: trimmed,
      durationMs,
    };
  }

  return {
    kind: "failure",
    error: "Agent returned invalid structured output.",
    durationMs,
  };
}

export class CliAgentAdapter implements AgentAdapter {
  readonly id: AgentId;
  readonly capabilityProfile: CapabilityProfile;

  #binary: string | null = null;
  #candidateBinaries: string[];

  constructor(input: {
    id: AgentId;
    capabilityProfile: CapabilityProfile;
    candidateBinaries: string[];
  }) {
    this.id = input.id;
    this.capabilityProfile = input.capabilityProfile;
    this.#candidateBinaries = input.candidateBinaries;
  }

  async detect(): Promise<string | null> {
    if (this.#binary) {
      return this.#binary;
    }

    this.#binary = await commandExists(this.#candidateBinaries);
    return this.#binary;
  }

  async invoke(input: AgentInvocation): Promise<AgentResponse> {
    const binary = await this.detect();

    if (!binary) {
      return {
        kind: "failure",
        error: `${this.id} is not installed.`,
        durationMs: 0,
      };
    }

    const spec = await this.#buildCommandSpec(binary, input);
    const result = await runProcess(
      spec.command,
      spec.args,
      input.cwd,
      input.timeoutMs,
      spec.stdin,
    );

    const fileOutput = spec.outputFile
      ? await readFile(spec.outputFile, "utf8").catch(() => "")
      : "";
    const normalizedOutput = fileOutput || result.stdout;

    if (spec.outputFile) {
      await rm(spec.outputFile, { force: true }).catch(() => undefined);
    }

    if (result.exitCode !== 0 && normalizedOutput.trim().length === 0) {
      return {
        kind: "failure",
        error: result.stderr.trim() || `${this.id} exited with code ${result.exitCode}.`,
        durationMs: result.durationMs,
      };
    }

    const parsed = parseStructuredOutput(normalizedOutput, input.allowPass, result.durationMs);

    if (result.exitCode !== 0 && parsed.kind !== "message" && parsed.kind !== "pass") {
      return {
        kind: "failure",
        error: result.stderr.trim() || normalizedOutput.trim() || `${this.id} exited with code ${result.exitCode}.`,
        durationMs: result.durationMs,
      };
    }

    return parsed;
  }

  async #buildCommandSpec(binary: string, input: AgentInvocation): Promise<CommandSpec> {
    switch (this.id) {
      case "codex": {
        const tempDir = await mkdtemp(join(tmpdir(), "xbrain-codex-"));
        const outputFile = join(tempDir, "last-message.txt");

        return {
          command: binary,
          args: [
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--color",
            "never",
            "--ephemeral",
            "-C",
            input.cwd,
            "-o",
            outputFile,
            "-",
          ],
          stdin: input.prompt,
          outputFile,
        };
      }
      case "claudecode":
        return {
          command: binary,
          args: [
            "--print",
            "--output-format",
            "text",
            "--permission-mode",
            "plan",
            input.prompt,
          ],
        };
      case "gemini":
        return {
          command: binary,
          args: [
            "--prompt",
            input.prompt,
            "--output-format",
            "text",
          ],
        };
    }
  }
}
