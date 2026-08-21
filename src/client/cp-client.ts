/**
 * HTTP client for the Frinus Control Plane.
 */
import axios, { AxiosInstance } from "axios";
import type { CpClientInterface } from "../types/index.js";
import { getResolvedTenantOrgId } from "./memory-client.js";
import { getResolvedClient } from "./client-info.js";

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
      config.headers['X-Client'] = getResolvedClient();
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

  // =========================================================================
  // Credential Vault
  // =========================================================================

  async storeCredential(integrationRef: string, data: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<any> {
    const response = await this.client.post(`/api/v1/credentials/${integrationRef}`, {
      data,
      metadata: metadata || {},
    });
    return response.data;
  }

  async getCredential(integrationRef: string): Promise<any> {
    const response = await this.client.get(`/api/v1/credentials/${integrationRef}`);
    return response.data;
  }

  async listCredentials(): Promise<any> {
    const response = await this.client.get(`/api/v1/credentials`);
    return response.data;
  }

  async deleteCredential(integrationRef: string): Promise<void> {
    await this.client.delete(`/api/v1/credentials/${integrationRef}`);
  }

  async listCredentialShares(integrationRef: string): Promise<any> {
    const response = await this.client.get(
      `/api/v1/credentials/${integrationRef}/shares`,
    );
    return response.data;
  }

  async shareCredential(
    integrationRef: string,
    userIdOrEmail: string,
  ): Promise<any> {
    // The API accepts either field; pick by shape so callers can pass
    // whichever they have. An email is what a human or agent usually knows.
    const body = userIdOrEmail.includes("@")
      ? { email: userIdOrEmail }
      : { user_id: userIdOrEmail };
    const response = await this.client.post(
      `/api/v1/credentials/${integrationRef}/shares`,
      body,
    );
    return response.data;
  }

  async revokeCredentialShare(
    integrationRef: string,
    granteeUserId: string,
  ): Promise<void> {
    await this.client.delete(
      `/api/v1/credentials/${integrationRef}/shares/${granteeUserId}`,
    );
  }
}
