import { createSign } from "node:crypto";

import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorAuthResult,
  ConnectorMetadata,
  ConnectorRunContext,
  RawConnectorMetric
} from "./types.js";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface GaRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

export class WebsiteConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "website",
    name: "Google Analytics 4 Connector",
    sourceName: "Google Analytics",
    category: "website",
    mode: "api",
    enabled: true,
    description: "Imports GA4 click activity for Website, Voice of Elim, and Elim Updates."
  };

  async authenticate(context: ConnectorRunContext): Promise<ConnectorAuthResult> {
    if (!context.config.ga4.configured) {
      return { ok: false, status: "Needs Setup", message: "GA4_PROPERTY_ID or GA4_SERVICE_ACCOUNT_JSON is missing." };
    }

    try {
      const account = parseServiceAccount(context.config.ga4.serviceAccountJson!);
      await getAccessToken(account);
      return { ok: true, status: "Connected", message: `Connected to GA4 property ${context.config.ga4.propertyId}.` };
    } catch (error) {
      return { ok: false, status: "Error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const account = parseServiceAccount(context.config.ga4.serviceAccountJson!);
    const token = await getAccessToken(account);
    const propertyId = context.config.ga4.propertyId!;
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "90daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }, { name: "pagePath" }, { name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "click" } } },
        limit: 100000
      })
    });

    if (!response.ok) {
      throw new Error(`GA4 Data API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { rows?: GaRow[] };
    const daily = new Map<string, number>();
    for (const row of data.rows ?? []) {
      const rawDate = row.dimensionValues?.[0]?.value ?? "";
      const pagePath = row.dimensionValues?.[1]?.value ?? "";
      const value = Number(row.metricValues?.[0]?.value ?? 0);
      const date = gaDate(rawDate);
      if (!date || !Number.isFinite(value)) continue;
      const channel = classifyChannel(pagePath);
      const key = `${date}|${channel}`;
      daily.set(key, (daily.get(key) ?? 0) + value);
    }

    const metrics = [...daily.entries()].map(([key, value]) => {
      const [date, channel] = key.split("|");
      return {
        sourceRecordId: `ga4:${propertyId}:${channel}:${date}:clicks`,
        metricName: `${channel} Clicks`,
        value,
        unit: "clicks",
        date,
        targetTableKey: "channelPerformance" as const,
        platform: channel === "Website" ? "Website" : channel,
        channel,
        contentType: "GA4 Web Activity"
      };
    });

    context.logger.info("GA4 metrics fetched", { propertyId, rows: data.rows?.length ?? 0, normalizedMetrics: metrics.length });
    return metrics;
  }

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    return [];
  }
}

function classifyChannel(pagePath: string): "Website" | "Voice of Elim" | "Elim Updates" {
  const path = pagePath.toLowerCase();
  if (path.includes("voice-of-elim") || path.includes("voice_of_elim") || path.includes("voiceofelim")) return "Voice of Elim";
  if (path.includes("elim-updates") || path.includes("elim_updates") || path.includes("elimupdates")) return "Elim Updates";
  return "Website";
}

function gaDate(value: string): string | undefined {
  if (!/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
}

function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("GA4_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  const account = parsed as Partial<ServiceAccount>;
  if (!account.client_email || !account.private_key) throw new Error("GA4 service account JSON is missing client_email or private_key.");
  return account as ServiceAccount;
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: tokenUri, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(account.private_key))}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Google OAuth response did not contain an access token.");
  return payload.access_token;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}
