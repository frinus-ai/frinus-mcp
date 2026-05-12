/**
 * HTTP client for the Frinus Control Plane.
 */
import axios, { AxiosInstance } from "axios";
import type { CpClientInterface } from "../types/index.js";
import { getResolvedTenantOrgId } from "./memory-client.js";

export class CpClient implements CpClientInterface {
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

  async createUniverse(orgId: string, data: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<any> {
    const response = await this.client.post(`/api/v1/orgs/${orgId}/universes`, data);
    return response.data;
  }

  async listUniverses(orgId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/orgs/${orgId}/universes`);
    return response.data;
  }

  async updateUniverse(orgId: string, universeId: string, data: {
    name?: string;
    description?: string;
  }): Promise<any> {
    const response = await this.client.put(`/api/v1/orgs/${orgId}/universes/${universeId}`, data);
    return response.data;
  }

  async deleteUniverse(orgId: string, universeId: string): Promise<void> {
    await this.client.delete(`/api/v1/orgs/${orgId}/universes/${universeId}`);
  }
}
