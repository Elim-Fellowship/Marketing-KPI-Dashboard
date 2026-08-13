import type { AirtableFields } from "../airtable/client.js";
import { Ga4Service, type Ga4ChannelMetrics } from "../services/ga4Service.js";
import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorAirtablePayload,
  ConnectorAuthResult,
  ConnectorMetadata,
  ConnectorRunContext,
  RawConnectorMetric
} from "./types.js";

interface ReportingPeriod { startDate: string; endDate: string; }
interface PublicationEntry { path: string; publishedDate: string; }
interface PublicationChannel { key: "voice_of_elim" | "elim_updates"; label: string; url: string; }

const PUBLICATION_CHANNELS: PublicationChannel[] = [
  { key: "voice_of_elim", label: "Voice of Elim", url: "https://elimfellowship.org/the-voice-of-elim" },
  { key: "elim_updates", label: "Elim Updates", url: "https://elimfellowship.org/updates" }
];

export class WebsiteConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "website",
    name: "Google Analytics 4 Connector",
    sourceName: "Google Analytics 4",
    category: "website",
    mode: "api",
    enabled: true,
    description: "Imports website GA4 analytics and combines publication discovery from elimfellowship.org with exact-article GA4 readership for Voice of Elim and Elim Updates."
  };

  async authenticate(context: ConnectorRunContext): Promise<ConnectorAuthResult> {
    if (!context.config.ga4.configured) {
      return { ok: false, status: "Needs Setup", message: "Missing GA4_SERVICE_ACCOUNT_JSON" };
    }
    try {
      await new Ga4Service(context.config).fetchPeriodMetrics(currentMonthStart(), currentDate());
      return { ok: true, status: "Connected", message: `GA4 property ${context.config.ga4.propertyId} authenticated.` };
    } catch (error) {
      return { ok: false, status: "Error", message: `GA4 authentication failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const service = new Ga4Service(context.config);
    const metrics: RawConnectorMetric[] = [];
    const publicationIndexes = new Map<string, PublicationEntry[]>();

    for (const channel of PUBLICATION_CHANNELS) {
      const entries = await discoverPublications(channel.url);
      publicationIndexes.set(channel.key, entries);
      context.logger.info("Publication index discovered", {
        channel: channel.label,
        sourceUrl: channel.url,
        publicationCount: entries.length,
        newestPublication: entries[0] ?? null
      });
    }

    for (const period of buildRollingMonthlyPeriods(new Date())) {
      const result = await service.fetchPeriodMetrics(period.startDate, period.endDate);
      pushMetricSet(metrics, {
        channelKey: "website",
        channelLabel: "Website",
        values: result.website,
        period,
        propertyId: result.propertyId
      });

      for (const channel of PUBLICATION_CHANNELS) {
        const entries = (publicationIndexes.get(channel.key) ?? []).filter(
          (entry) => entry.publishedDate >= period.startDate && entry.publishedDate <= period.endDate
        );
        const uniquePaths = Array.from(new Set(entries.map((entry) => entry.path)));
        const readership = await service.fetchMetricsForPaths(period.startDate, period.endDate, uniquePaths);
        pushPublicationMetricSet(metrics, {
          channelKey: channel.key,
          channelLabel: channel.label,
          publicationCount: uniquePaths.length,
          values: readership,
          period,
          propertyId: result.propertyId,
          paths: uniquePaths
        });
        context.logger.info("GA4 publication analytics loaded", {
          channel: channel.label,
          startDate: period.startDate,
          endDate: period.endDate,
          publications: uniquePaths.length,
          articlePaths: uniquePaths,
          sessions: readership.sessions,
          pageViews: readership.pageViews
        });
      }

      context.logger.info("GA4 website analytics loaded", {
        propertyId: result.propertyId,
        startDate: period.startDate,
        endDate: period.endDate,
        websiteSessions: result.website.sessions,
        websitePageViews: result.website.pageViews
      });
    }
    return metrics;
  }

  async transformData(metrics: RawConnectorMetric[], _context: ConnectorRunContext): Promise<ConnectorAirtablePayload> {
    const normalized = metrics.map((metric) => this.normalizeMetric(metric));
    const syncedAt = new Date().toISOString();
    return {
      metrics: normalized,
      records: normalized.map((metric) => {
        const metricKey = String(metric.dimensions?.metricKey ?? "ga4_metric");
        const periodStart = String(metric.dimensions?.periodStart ?? metric.date);
        const periodEnd = String(metric.dimensions?.periodEnd ?? metric.date);
        const periodType = String(metric.dimensions?.periodType ?? "Monthly");
        const uniqueKey = ["ga4", metricKey, periodType.toLowerCase(), periodStart, periodEnd].join(":");
        const fields: AirtableFields = {
          "Unique Key": uniqueKey,
          Metric: metric.metricName,
          "Metric Key": metricKey,
          KPI: metric.metricName,
          Value: metric.value,
          Unit: metric.unit,
          "Period Type": periodType,
          Date: periodStart,
          "Period Start": periodStart,
          "Period End": periodEnd,
          "Aggregation Method": "Sum",
          Channel: metric.channel ?? "Website",
          Platform: "GA4",
          "Source Name": "Google Analytics 4",
          "Quality Status": "Complete",
          "Snapshot Date": periodEnd,
          "Reporting Month": periodStart.slice(0, 7),
          "Source Record ID": metric.sourceRecordId,
          "Last Synced At": syncedAt
        };
        return { tableKey: "kpiHistory" as const, uniqueKey: { fieldName: "Unique Key", value: uniqueKey }, fields };
      })
    };
  }

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    return [];
  }
}

function pushMetricSet(metrics: RawConnectorMetric[], input: {
  channelKey: string;
  channelLabel: string;
  values: Ga4ChannelMetrics;
  period: ReportingPeriod;
  propertyId: string;
}): void {
  const definitions = [
    { suffix: "sessions", name: `${input.channelLabel} Sessions`, unit: "sessions", value: input.values.sessions },
    { suffix: "active_users", name: `${input.channelLabel} Active Users`, unit: "users", value: input.values.activeUsers },
    { suffix: "page_views", name: `${input.channelLabel} Page Views`, unit: "views", value: input.values.pageViews }
  ];
  for (const definition of definitions) pushMetric(metrics, input.channelKey, input.channelLabel, definition, input.period, input.propertyId);
}

function pushPublicationMetricSet(metrics: RawConnectorMetric[], input: {
  channelKey: string;
  channelLabel: string;
  publicationCount: number;
  values: Ga4ChannelMetrics;
  period: ReportingPeriod;
  propertyId: string;
  paths: string[];
}): void {
  const definitions = [
    { suffix: "publications", name: `${input.channelLabel} Publications`, unit: "publications", value: input.publicationCount },
    { suffix: "sessions", name: `${input.channelLabel} Article Sessions`, unit: "sessions", value: input.values.sessions },
    { suffix: "active_users", name: `${input.channelLabel} Article Active Users`, unit: "users", value: input.values.activeUsers },
    { suffix: "page_views", name: `${input.channelLabel} Article Page Views`, unit: "views", value: input.values.pageViews }
  ];
  for (const definition of definitions) {
    pushMetric(metrics, input.channelKey, input.channelLabel, definition, input.period, input.propertyId, input.paths);
  }
}

function pushMetric(
  metrics: RawConnectorMetric[],
  channelKey: string,
  channelLabel: string,
  definition: { suffix: string; name: string; unit: string; value: number },
  period: ReportingPeriod,
  propertyId: string,
  paths: string[] = []
): void {
  metrics.push({
    sourceRecordId: `ga4:${channelKey}:${definition.suffix}:${period.startDate}:${period.endDate}`,
    metricName: definition.name,
    value: definition.value,
    unit: definition.unit,
    date: period.startDate,
    targetTableKey: "kpiHistory",
    platform: "GA4",
    channel: channelLabel,
    contentType: paths.length ? "Publication Analytics" : "Web Analytics",
    activityVolume: definition.suffix === "publications" || definition.suffix === "sessions" ? definition.value : undefined,
    dimensions: {
      metricKey: `ga4_${channelKey}_${definition.suffix}`,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      periodType: "Monthly",
      aggregationMethod: "Sum",
      propertyId,
      articlePaths: paths.join("|")
    }
  });
}

async function discoverPublications(url: string): Promise<PublicationEntry[]> {
  const response = await fetch(url, { headers: { "User-Agent": "Elim-KPI-Dashboard/1.0" } });
  if (!response.ok) throw new Error(`Publication discovery failed for ${url}: ${response.status} ${response.statusText}`);
  const html = await response.text();
  const entries: PublicationEntry[] = [];
  const linkPattern = /href=["']([^"']*\/article-detail\/[^"'#?]+)["']/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const href = decodeHtml(linkMatch[1] ?? "");
    const before = stripTags(html.slice(Math.max(0, linkMatch.index - 3500), linkMatch.index));
    const dates = Array.from(before.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\b/gi));
    const dateMatch = dates[dates.length - 1];
    if (!dateMatch) continue;
    const publishedDate = parsePublicationDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!publishedDate) continue;
    const path = new URL(href, url).pathname.replace(/\/$/, "");
    if (!path.startsWith("/article-detail/")) continue;
    entries.push({ path, publishedDate });
  }

  const deduped = new Map<string, PublicationEntry>();
  for (const entry of entries) deduped.set(`${entry.path}:${entry.publishedDate}`, entry);
  return Array.from(deduped.values()).sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
}

function parsePublicationDate(day: string | undefined, month: string | undefined, year: string | undefined): string | undefined {
  if (!day || !month || !year) return undefined;
  const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const monthIndex = months[month.toLowerCase()];
  if (monthIndex === undefined) return undefined;
  const date = new Date(Date.UTC(2000 + Number(year), monthIndex, Number(day)));
  return formatDate(date);
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function buildRollingMonthlyPeriods(now: Date): ReportingPeriod[] {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const today = formatDate(now);
  const periods: ReportingPeriod[] = [];
  for (let monthsBack = 2; monthsBack >= 0; monthsBack -= 1) {
    const start = new Date(Date.UTC(currentYear, currentMonth - monthsBack, 1));
    const end = monthsBack === 0 ? today : formatDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)));
    periods.push({ startDate: formatDate(start), endDate: end });
  }
  return periods;
}
function currentDate(): string { return new Date().toISOString().slice(0, 10); }
function currentMonthStart(): string { const now = new Date(); return formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))); }
function formatDate(value: Date): string { return value.toISOString().slice(0, 10); }
