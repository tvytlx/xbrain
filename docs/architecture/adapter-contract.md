# Adapter Contract

## Goals

- Keep orchestration logic independent from CLI-specific details
- Support discovery, invocation, timeout handling, and normalization
- Make it possible to run mock adapters in tests

## Interface

```ts
export type AgentId = "codex" | "claudecode" | "gemini";

export type AgentRoleInTurn = "lead" | "challenger";

export type AgentInvocation = {
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  prompt: string;
  cwd: string;
  timeoutMs: number;
};

export type AgentResponse =
  | {
      kind: "message";
      text: string;
      durationMs: number;
    }
  | {
      kind: "pass";
      reason: string;
      durationMs: number;
    }
  | {
      kind: "failure";
      error: string;
      durationMs: number;
    };

export interface AgentAdapter {
  readonly id: AgentId;
  detect(): Promise<boolean>;
  invoke(input: AgentInvocation): Promise<AgentResponse>;
}
```

## Discovery Rules

- `codex`: detect `codex`
- `claudecode`: detect `claudecode` first, then `claude`
- `gemini`: detect `gemini`

## Invocation Rules

- The lead must return a message or failure
- A challenger may return `pass`
- Adapters should return normalized durations
- Adapters should not decide room-level policy

## Output Parsing

CLI output should be normalized before it reaches the orchestrator:

- trim transport noise
- capture stderr as error context when needed
- prefer stable text output modes when the CLI supports them

## Testing

All orchestration tests should run against a mock adapter rather than live CLIs.
