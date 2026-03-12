import type { AgentAdapter, AgentInvocation, AgentResponse } from "./base.ts";
import type { AgentId, CapabilityProfile } from "../core/types.ts";

type MockHandler = (input: AgentInvocation) => Promise<AgentResponse> | AgentResponse;

export class MockAdapter implements AgentAdapter {
  readonly id: AgentId;
  readonly capabilityProfile: CapabilityProfile;

  #handler: MockHandler;

  constructor(input: {
    id: AgentId;
    capabilityProfile: CapabilityProfile;
    handler: MockHandler;
  }) {
    this.id = input.id;
    this.capabilityProfile = input.capabilityProfile;
    this.#handler = input.handler;
  }

  async detect(): Promise<string | null> {
    return `${this.id}-mock`;
  }

  async invoke(input: AgentInvocation): Promise<AgentResponse> {
    return this.#handler(input);
  }
}
