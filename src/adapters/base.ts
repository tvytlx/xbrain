import type {
  AgentId,
  AgentRoleInTurn,
  CapabilityProfile,
} from "../core/types.ts";

export type AgentInvocation = {
  agentId: AgentId;
  roleInTurn: AgentRoleInTurn;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  allowPass: boolean;
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
  readonly capabilityProfile: CapabilityProfile;
  detect(): Promise<string | null>;
  invoke(input: AgentInvocation): Promise<AgentResponse>;
}
