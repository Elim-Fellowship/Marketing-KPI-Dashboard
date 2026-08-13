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
interface ChannelDefinition { key: string; label: string; pick: (period: Awaited<ReturnType<Ga4Service["fetchPeriodMetrics"]>>) => Ga4ChannelMetrics; }

const CHANNELS: ChannelDefinition[] = [
  { key: "website", label: "Website", pick: (period) => period.website },
  { key: "voice_of_elim", label: "Voice of Elim", pick: (period) => period.voiceOfElim },
  { key: "elim_updates", label: "Elim Updates", pick: (period) => period.elimUpdates }
];

export class WebsiteConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "website",
    name: "Google Analytics 4 Connector",
    sourceName: "Google Analytics 4",
    category: "website",
    mode: "api",
    enabled: true,
    description: "Imports live GA4 sessions, active users, and page views for the website, Voice of Elim, and Elim Updates."
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

    for (const period of buildRollingMonthlyPeriods(new Date())) {
      const result = await service.fetchPeriodMetrics(period.startDate, period.endDate);
      for (const channel of CHANNELS) {
        const values = channel.pick(result);
        const definitions = [
          { suffix: "sessions", name: `${channel.label} Sessions`, unit: "sessions", value: values.sessions },
          { suffix: "active_users", name: `${channel.label} Active Users`, unit: "users", value: values.activeUsers },
          { suffix: "page_views", name: `${channel.label} Page Views`, unit: "views", value: values.pageViews }
        ];
        for (const definition of definitions) {
          metrics.push({
            sourceRecordId: `ga4:${channel.key}:${definition.suffix}:${period.startDate}:${period.endDate}`,
            metricName: definition.name,
            value: definition.value,
            unit: definition.unit,
            date: period.startDate,
            targetTableKey: "kpiHistory",
            platform: "GA4",
            channel: channel.label,
            contentType: "Web Analytics",
            activityVolume: definition.suffix === "sessions" ? values.sessions : undefined,
            dimensions: {
              metricKey: `ga4_${channel.key}_${definition.suffix}`,
              periodStart: period.startDate,
              periodEnd: period.endDate,
              periodType: "Monthly",
              aggregationMethod: "Sum",
              propertyId: result.propertyId
            }
          });
        }
      }
      context.logger.info("GA4 monthly analytics loaded", {
        propertyId: result.propertyId,
        startDate: period.startDate,
        endDate: period.endDate,
        websiteSessions: result.website.sessions,
        websitePageViews: result.website.pageViews,
        voiceOfElimPageViews: result.voiceOfElim.pageViews,
        elimUpdatesPageViews: result.elimUpdates.pageViews
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
