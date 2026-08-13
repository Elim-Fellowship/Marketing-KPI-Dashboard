import { createSign } from "node:crypto";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export interface Ga4ChannelMetrics { sessions: number; activeUsers: number; pageViews: number; }
export interface Ga4WebsiteMetrics extends Ga4ChannelMetrics { engagedSessions: number; engagementRate: number; bounceRate: number; }
export interface Ga4PeriodMetrics { propertyId: string; startDate: string; endDate: string; website: Ga4WebsiteMetrics; voiceOfElim: Ga4ChannelMetrics; elimUpdates: Ga4ChannelMetrics; }
interface PageMetricRow { pagePath: string; pageTitle: string; sessions: number; activeUsers: number; screenPageViews: number; }

export class Ga4Service {
  constructor(private readonly config: AppConfig) {}
  get configured(): boolean { return Boolean(this.config.ga4.serviceAccountJson && this.config.ga4.propertyId); }

  async test(startDate: string, endDate: string): Promise<unknown> {
    const [report, website, trafficQuality, suspiciousReferral] = await Promise.all([
      this.getPageReport(startDate, endDate, 100),
      this.getWebsiteSummary(startDate, endDate),
      this.trafficQuality(startDate, endDate),
      this.referralForensics(startDate, endDate, "trafficheap.cc")
    ]);
    return { configured: true, propertyId: this.config.ga4.propertyId, dateRange: { startDate, endDate }, website, trafficQuality, suspiciousReferral, topPages: this.mapRows(report.rows ?? []).slice(0, 25), rowCount: report.rowCount ?? 0, writesPerformed: false };
  }

  async searchPages(startDate: string, endDate: string, contains: string): Promise<unknown> {
    const report = await this.getPageReport(startDate, endDate, 10000); const needle = contains.trim().toLowerCase();
    if (!needle) throw new AppError("VALIDATION_FAILED", "contains query parameter is required");
    const matches = this.mapRows(report.rows ?? []).filter((row) => `${row.pagePath} ${row.pageTitle}`.toLowerCase().includes(needle));
    return { configured: true, propertyId: this.config.ga4.propertyId, dateRange: { startDate, endDate }, contains, matches, matchCount: matches.length, totalRowsSearched: report.rowCount ?? 0, writesPerformed: false };
  }

  async trafficQuality(startDate: string, endDate: string): Promise<unknown> {
    validateRange(startDate, endDate); const accessToken = await this.getAuthenticatedToken();
    const payload = await this.runReport(accessToken, startDate, endDate, [{ name: "sessionSourceMedium" }], [{ name: "sessions" }, { name: "engagedSessions" }, { name: "engagementRate" }, { name: "bounceRate" }, { name: "screenPageViews" }], undefined, 50, "sessions");
    return { sources: (payload.rows ?? []).map((row: any) => ({ sourceMedium: row.dimensionValues?.[0]?.value ?? "(not set)", sessions: finite(row.metricValues?.[0]?.value), engagedSessions: finite(row.metricValues?.[1]?.value), engagementRate: finite(row.metricValues?.[2]?.value), bounceRate: finite(row.metricValues?.[3]?.value), pageViews: finite(row.metricValues?.[4]?.value) })) };
  }

  async referralForensics(startDate: string, endDate: string, source: string): Promise<unknown> {
    validateRange(startDate, endDate); const accessToken = await this.getAuthenticatedToken();
    const metrics = [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagedSessions" }, { name: "screenPageViews" }, { name: "eventCount" }];
    const filter = { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: source, caseSensitive: false } } };
    const [locationPayload, devicePayload, eventPayload] = await Promise.all([
      this.runReport(accessToken, startDate, endDate, [{ name: "hostName" }, { name: "pagePath" }, { name: "pageTitle" }, { name: "country" }], metrics, filter, 100, "sessions"),
      this.runReport(accessToken, startDate, endDate, [{ name: "deviceCategory" }, { name: "browser" }, { name: "operatingSystem" }, { name: "country" }], metrics, filter, 100, "sessions"),
      this.runReport(accessToken, startDate, endDate, [{ name: "eventName" }], [{ name: "eventCount" }, { name: "sessions" }, { name: "activeUsers" }], filter, 100, "eventCount")
    ]);
    const metricRow = (row: any) => ({ sessions: finite(row.metricValues?.[0]?.value), activeUsers: finite(row.metricValues?.[1]?.value), engagedSessions: finite(row.metricValues?.[2]?.value), pageViews: finite(row.metricValues?.[3]?.value), eventCount: finite(row.metricValues?.[4]?.value) });
    return {
      source,
      locations: (locationPayload.rows ?? []).map((row: any) => ({ hostName: row.dimensionValues?.[0]?.value ?? "", pagePath: row.dimensionValues?.[1]?.value ?? "", pageTitle: row.dimensionValues?.[2]?.value ?? "", country: row.dimensionValues?.[3]?.value ?? "", ...metricRow(row) })),
      devices: (devicePayload.rows ?? []).map((row: any) => ({ deviceCategory: row.dimensionValues?.[0]?.value ?? "", browser: row.dimensionValues?.[1]?.value ?? "", operatingSystem: row.dimensionValues?.[2]?.value ?? "", country: row.dimensionValues?.[3]?.value ?? "", ...metricRow(row) })),
      events: (eventPayload.rows ?? []).map((row: any) => ({ eventName: row.dimensionValues?.[0]?.value ?? "", eventCount: finite(row.metricValues?.[0]?.value), sessions: finite(row.metricValues?.[1]?.value), activeUsers: finite(row.metricValues?.[2]?.value) })),
      writesPerformed: false
    };
  }

  async fetchPeriodMetrics(startDate: string, endDate: string): Promise<Ga4PeriodMetrics> {
    validateRange(startDate, endDate); const [report, website] = await Promise.all([this.getPageReport(startDate, endDate, 10000), this.getWebsiteSummary(startDate, endDate)]); const rows = this.mapRows(report.rows ?? []);
    return { propertyId: this.config.ga4.propertyId, startDate, endDate, website, voiceOfElim: aggregateExactPaths(rows, ["/the-voice-of-elim"]), elimUpdates: aggregateExactPaths(rows, ["/updates"]) };
  }

  async fetchMetricsForPaths(startDate: string, endDate: string, pagePaths: string[]): Promise<Ga4ChannelMetrics> {
    validateRange(startDate, endDate); if (pagePaths.length === 0) return { sessions: 0, activeUsers: 0, pageViews: 0 }; const report = await this.getPageReport(startDate, endDate, 10000); return aggregateExactPaths(this.mapRows(report.rows ?? []), pagePaths);
  }

  private async getWebsiteSummary(startDate: string, endDate: string): Promise<Ga4WebsiteMetrics> {
    validateRange(startDate, endDate); const accessToken = await this.getAuthenticatedToken();
    const payload = await this.runReport(accessToken, startDate, endDate, [], [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }, { name: "engagedSessions" }, { name: "engagementRate" }, { name: "bounceRate" }]); const values = payload.rows?.[0]?.metricValues ?? [];
    return { sessions: finite(values[0]?.value), activeUsers: finite(values[1]?.value), pageViews: finite(values[2]?.value), engagedSessions: finite(values[3]?.value), engagementRate: finite(values[4]?.value), bounceRate: finite(values[5]?.value) };
  }

  private mapRows(rows: any[]): PageMetricRow[] { return rows.map((row: any) => ({ pagePath: row.dimensionValues?.[0]?.value ?? "", pageTitle: row.dimensionValues?.[1]?.value ?? "", sessions: finite(row.metricValues?.[0]?.value), activeUsers: finite(row.metricValues?.[1]?.value), screenPageViews: finite(row.metricValues?.[2]?.value) })); }
  private async getPageReport(startDate: string, endDate: string, limit: number): Promise<any> { validateRange(startDate, endDate); return this.runReport(await this.getAuthenticatedToken(), startDate, endDate, [{ name: "pagePath" }, { name: "pageTitle" }], [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }], undefined, limit, "screenPageViews"); }
  private async getAuthenticatedToken(): Promise<string> { if (!this.config.ga4.serviceAccountJson) throw new AppError("MISSING_ENV", "GA4_SERVICE_ACCOUNT_JSON is not configured"); return this.getAccessToken(this.parseCredentials()); }
  private parseCredentials(): ServiceAccount { try { const parsed = JSON.parse(this.config.ga4.serviceAccountJson!); if (!parsed.client_email || !parsed.private_key) throw new Error("Missing client_email or private_key"); return parsed; } catch (error) { throw new AppError("VALIDATION_FAILED", "GA4_SERVICE_ACCOUNT_JSON is not valid service-account JSON", { cause: error instanceof Error ? error.message : String(error) }); } }
  private async getAccessToken(credentials: ServiceAccount): Promise<string> { const now = Math.floor(Date.now() / 1000); const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })); const claims = base64Url(JSON.stringify({ iss: credentials.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: credentials.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })); const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claims}`); signer.end(); const assertion = `${header}.${claims}.${signer.sign(credentials.private_key, "base64url")}`; const tokenResponse = await fetch(credentials.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) }); const payload = await tokenResponse.json() as any; if (!tokenResponse.ok || !payload.access_token) throw new Error(`GA4 token request failed (${tokenResponse.status}): ${payload.error_description ?? payload.error ?? tokenResponse.statusText}`); return payload.access_token; }
  private async runReport(accessToken: string, startDate: string, endDate: string, dimensions: Array<{ name: string }>, metrics: Array<{ name: string }>, dimensionFilter?: unknown, limit = 10000, orderMetric?: string): Promise<any> {
    const body: any = { dateRanges: [{ startDate, endDate }], metrics, limit }; if (dimensions.length) body.dimensions = dimensions; if (dimensionFilter) body.dimensionFilter = dimensionFilter; if (orderMetric) body.orderBys = [{ metric: { metricName: orderMetric }, desc: true }];
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(this.config.ga4.propertyId)}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json() as any; if (!response.ok) throw new Error(`GA4 Data API request failed (${response.status}): ${payload.error?.message ?? response.statusText}`); return payload;
  }
}
function aggregateExactPaths(rows: PageMetricRow[], pagePaths: string[]): Ga4ChannelMetrics { const pathSet = new Set(pagePaths.map(normalizePath)); return rows.filter((row) => pathSet.has(normalizePath(row.pagePath))).reduce<Ga4ChannelMetrics>((sum, row) => ({ sessions: sum.sessions + row.sessions, activeUsers: sum.activeUsers + row.activeUsers, pageViews: sum.pageViews + row.screenPageViews }), { sessions: 0, activeUsers: 0, pageViews: 0 }); }
function normalizePath(value: string): string { const path = value.split("?")[0]?.replace(/\/$/, "") ?? value; return path || "/"; }
function validateRange(startDate: string, endDate: string): void { if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new AppError("VALIDATION_FAILED", "GA4 dates must use YYYY-MM-DD format"); if (startDate > endDate) throw new AppError("VALIDATION_FAILED", "GA4 startDate must be on or before endDate"); }
function finite(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function base64Url(value: string): string { return Buffer.from(value).toString("base64url"); }
