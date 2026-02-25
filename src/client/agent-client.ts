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
}
