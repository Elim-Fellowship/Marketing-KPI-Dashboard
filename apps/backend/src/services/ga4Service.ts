import { createSign } from "node:crypto";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export class Ga4Service {
  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.ga4.serviceAccountJson && this.config.ga4.propertyId);
  }

  async test(startDate: string, endDate: string): Promise<unknown> {
    if (!this.config.ga4.serviceAccountJson) throw new AppError("MISSING_ENV", "GA4_SERVICE_ACCOUNT_JSON is not configured");
    const credentials = this.parseCredentials();
    const accessToken = await this.getAccessToken(credentials);
    const report = await this.runReport(accessToken, startDate, endDate);
    return {
      configured: true,
      propertyId: this.config.ga4.propertyId,
      dateRange: { startDate, endDate },
      totals: report.totals?.[0]?.metricValues?.map((item: { value?: string }) => item.value ?? "0") ?? [],
      metricHeaders: report.metricHeaders?.map((item: { name?: string }) => item.name ?? "") ?? [],
      topPages: (report.rows ?? []).slice(0, 25).map((row: any) => ({
        pagePath: row.dimensionValues?.[0]?.value ?? "",
        pageTitle: row.dimensionValues?.[1]?.value ?? "",
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
        activeUsers: Number(row.metricValues?.[1]?.value ?? 0),
        screenPageViews: Number(row.metricValues?.[2]?.value ?? 0)
      })),
      rowCount: report.rowCount ?? 0,
      writesPerformed: false
    };
  }

  private parseCredentials(): ServiceAccount {
    try {
      const parsed = JSON.parse(this.config.ga4.serviceAccountJson!);
      if (!parsed.client_email || !parsed.private_key) throw new Error("Missing client_email or private_key");
      return parsed;
    } catch (error) {
      throw new AppError("INVALID_CONFIG", "GA4_SERVICE_ACCOUNT_JSON is not valid service-account JSON", { cause: error instanceof Error ? error.message : String(error) });
    }
  }

  private async getAccessToken(credentials: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: credentials.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    signer.end();
    const signature = signer.sign(credentials.private_key, "base64url");
    const assertion = `${header}.${claims}.${signature}`;
    const tokenResponse = await fetch(credentials.token_uri ?? "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    const payload = await tokenResponse.json() as any;
    if (!tokenResponse.ok || !payload.access_token) {
      throw new AppError("EXTERNAL_API_ERROR", `GA4 token request failed (${tokenResponse.status}): ${payload.error_description ?? payload.error ?? tokenResponse.statusText}`);
    }
    return payload.access_token;
  }

  private async runReport(accessToken: string, startDate: string, endDate: string): Promise<any> {
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(this.config.ga4.propertyId)}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }],
        metricAggregations: ["TOTAL"],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 100
      })
    });
    const payload = await response.json() as any;
    if (!response.ok) {
      throw new AppError("EXTERNAL_API_ERROR", `GA4 Data API request failed (${response.status}): ${payload.error?.message ?? response.statusText}`, { googleError: payload.error });
    }
    return payload;
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
