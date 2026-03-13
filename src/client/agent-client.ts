/**
 * HTTP client for the Frinus Agent Service.
 */
import axios, { AxiosInstance } from "axios";
import type { AgentClientInterface } from "../types/index.js";
import { getResolvedTenantOrgId } from "./memory-client.js";

export class AgentClient implements AgentClientInterface {
  private client: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });

    this.client.interceptors.request.use((config) => {
      config.headers = config.headers || {};
      config.headers['X-API-Key'] = apiKey;
      const orgId = getResolvedTenantOrgId();
      if (orgId) config.headers['X-Tenant-ID'] = orgId;
      return config;
    });
  }

  async createAgent(data: {
    name: string;
    template_id?: string;
    universe_id?: string;
    persona?: Record<string, unknown>;
    team_id?: string;
    is_team_lead?: boolean;
  }): Promise<any> {
    const response = await this.client.post("/api/v1/agents", data);
    return response.data;
  }

  async listAgents(orgId?: string): Promise<any> {
    const params = orgId ? { org_id: orgId } : {};
    const response = await this.client.get("/api/v1/agents", { params });
    return response.data;
  }

  async getAgent(agentId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/agents/${agentId}`);
    return response.data;
  }

  async updateAgentPersona(agentId: string, data: {
    name?: string;
    personality?: string;
    instructions?: string;
    greeting?: string;
    forbidden_topics?: string[];
    language?: string;
    specialization?: string;
  }): Promise<any> {
    const response = await this.client.put(`/api/v1/agents/${agentId}/persona`, data);
    return response.data;
  }

  async deleteAgent(agentId: string): Promise<any> {
    const response = await this.client.delete(`/api/v1/agents/${agentId}`);
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  async invokeAgent(data: {
    agent_id?: string;
    agent_name?: string;
    message: string;
    task_id?: string;
    context?: Record<string, unknown>;
    timeout_seconds?: number;
  }): Promise<any> {
    // Resolve agent_id from name if needed
    let agentId = data.agent_id;
    if (!agentId && data.agent_name) {
      const agents = await this.listAgents();
      const found = agents.find(
        (a: any) => a.name?.toLowerCase() === data.agent_name!.toLowerCase()
      );
      if (found) agentId = found.id;
      else throw new Error(`Agent '${data.agent_name}' not found`);
    }
    if (!agentId) throw new Error("Either agent_id or agent_name is required");

    const response = await this.client.post(`/api/v1/agents/${agentId}/invoke`, {
      task_id: data.task_id || "00000000-0000-0000-0000-000000000000",
      message: data.message,
      context: data.context,
      timeout_seconds: data.timeout_seconds || 120,
    }, { timeout: (data.timeout_seconds || 120) * 1000 + 5000 });
    return response.data;
  }
}
