import { createSign } from "node:crypto";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export interface Ga4ChannelMetrics {
  sessions: number;
  activeUsers: number;
  pageViews: number;
}

export interface Ga4PeriodMetrics {
  propertyId: string;
  startDate: string;
  endDate: string;
  website: Ga4ChannelMetrics;
  voiceOfElim: Ga4ChannelMetrics;
  elimUpdates: Ga4ChannelMetrics;
}

interface PageMetricRow {
  pagePath: string;
  pageTitle: string;
  sessions: number;
  activeUsers: number;
  screenPageViews: number;
}

export class Ga4Service {
  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.ga4.serviceAccountJson && this.config.ga4.propertyId);
  }

  async test(startDate: string, endDate: string): Promise<unknown> {
    const report = await this.getPageReport(startDate, endDate, 100);
    return {
      configured: true,
      propertyId: this.config.ga4.propertyId,
      dateRange: { startDate, endDate },
      totals: report.totals?.[0]?.metricValues?.map((item: { value?: string }) => item.value ?? "0") ?? [],
      metricHeaders: report.metricHeaders?.map((item: { name?: string }) => item.name ?? "") ?? [],
      topPages: this.mapRows(report.rows ?? []).slice(0, 25),
      rowCount: report.rowCount ?? 0,
      writesPerformed: false
    };
  }

  async searchPages(startDate: string, endDate: string, contains: string): Promise<unknown> {
    const report = await this.getPageReport(startDate, endDate, 10000);
    const needle = contains.trim().toLowerCase();
    if (!needle) throw new AppError("VALIDATION_FAILED", "contains query parameter is required");
    const matches = this.mapRows(report.rows ?? []).filter((row) => `${row.pagePath} ${row.pageTitle}`.toLowerCase().includes(needle));
    return {
      configured: true,
      propertyId: this.config.ga4.propertyId,
      dateRange: { startDate, endDate },
      contains,
      matches,
      matchCount: matches.length,
      totalRowsSearched: report.rowCount ?? 0,
      writesPerformed: false
    };
  }

  async fetchPeriodMetrics(startDate: string, endDate: string): Promise<Ga4PeriodMetrics> {
    validateRange(startDate, endDate);
    const report = await this.getPageReport(startDate, endDate, 10000);
    const rows = this.mapRows(report.rows ?? []);
    const totals = report.totals?.[0]?.metricValues ?? [];

    return {
      propertyId: this.config.ga4.propertyId,
      startDate,
      endDate,
      website: {
        sessions: finite(totals[0]?.value),
        activeUsers: finite(totals[1]?.value),
        pageViews: finite(totals[2]?.value)
      },
      voiceOfElim: aggregateExactPaths(rows, ["/the-voice-of-elim"]),
      elimUpdates: aggregateExactPaths(rows, ["/updates"])
    };
  }

  async fetchMetricsForPaths(startDate: string, endDate: string, pagePaths: string[]): Promise<Ga4ChannelMetrics> {
    validateRange(startDate, endDate);
    if (pagePaths.length === 0) return { sessions: 0, activeUsers: 0, pageViews: 0 };
    const report = await this.getPageReport(startDate, endDate, 10000);
    return aggregateExactPaths(this.mapRows(report.rows ?? []), pagePaths);
  }

  private mapRows(rows: any[]): PageMetricRow[] {
    return rows.map((row: any) => ({
      pagePath: row.dimensionValues?.[0]?.value ?? "",
      pageTitle: row.dimensionValues?.[1]?.value ?? "",
      sessions: finite(row.metricValues?.[0]?.value),
      activeUsers: finite(row.metricValues?.[1]?.value),
      screenPageViews: finite(row.metricValues?.[2]?.value)
    }));
  }

  private async getPageReport(startDate: string, endDate: string, limit: number): Promise<any> {
    validateRange(startDate, endDate);
    if (!this.config.ga4.serviceAccountJson) throw new AppError("MISSING_ENV", "GA4_SERVICE_ACCOUNT_JSON is not configured");
    const credentials = this.parseCredentials();
    const accessToken = await this.getAccessToken(credentials);
    return this.runReport(accessToken, startDate, endDate, limit);
  }

  private parseCredentials(): ServiceAccount {
    try {
      const parsed = JSON.parse(this.config.ga4.serviceAccountJson!);
      if (!parsed.client_email || !parsed.private_key) throw new Error("Missing client_email or private_key");
      return parsed;
    } catch (error) {
      throw new AppError("VALIDATION_FAILED", "GA4_SERVICE_ACCOUNT_JSON is not valid service-account JSON", {
        cause: error instanceof Error ? error.message : String(error)
      });
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
      throw new Error(`GA4 token request failed (${tokenResponse.status}): ${payload.error_description ?? payload.error ?? tokenResponse.statusText}`);
    }
    return payload.access_token;
  }

  private async runReport(accessToken: string, startDate: string, endDate: string, limit: number): Promise<any> {
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(this.config.ga4.propertyId)}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }],
        metricAggregations: ["TOTAL"],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit
      })
    });
    const payload = await response.json() as any;
    if (!response.ok) throw new Error(`GA4 Data API request failed (${response.status}): ${payload.error?.message ?? response.statusText}`);
    return payload;
  }
}

function aggregateExactPaths(rows: PageMetricRow[], pagePaths: string[]): Ga4ChannelMetrics {
  const pathSet = new Set(pagePaths.map(normalizePath));
  return rows
    .filter((row) => pathSet.has(normalizePath(row.pagePath)))
    .reduce<Ga4ChannelMetrics>((sum, row) => ({
      sessions: sum.sessions + row.sessions,
      activeUsers: sum.activeUsers + row.activeUsers,
      pageViews: sum.pageViews + row.screenPageViews
    }), { sessions: 0, activeUsers: 0, pageViews: 0 });
}

function normalizePath(value: string): string {
  const path = value.split("?")[0]?.replace(/\/$/, "") ?? value;
  return path || "/";
}

function validateRange(startDate: string, endDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new AppError("VALIDATION_FAILED", "GA4 dates must use YYYY-MM-DD format");
  }
  if (startDate > endDate) throw new AppError("VALIDATION_FAILED", "GA4 startDate must be on or before endDate");
}

function finite(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
