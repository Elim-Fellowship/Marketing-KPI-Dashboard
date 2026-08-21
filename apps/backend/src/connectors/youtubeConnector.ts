import type { AirtableFields } from "../airtable/client.js";
import { YouTubeService, type YouTubePeriodMetrics } from "../services/youtubeService.js";
import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorAirtablePayload,
  ConnectorAuthResult,
  ConnectorMetadata,
  ConnectorRunContext,
  RawConnectorMetric
} from "./types.js";

const ELIM_YOUTUBE_CHANNEL_ID = "UCGRjTp3nEHMiJ3-UQgRN0Qw";
const YOUTUBE_HISTORY_START_DATE = "2026-01-01";

interface ReportingPeriod {
  startDate: string;
  endDate: string;
}

interface MetricDefinition {
  key: string;
  name: string;
  unit: string;
  value: (period: YouTubePeriodMetrics) => number;
  aggregationMethod: "Sum" | "Average";
}

const METRICS: MetricDefinition[] = [
  { key: "youtube_videos_published", name: "Videos Published", unit: "videos", value: (period) => period.videosPublished, aggregationMethod: "Sum" },
  { key: "youtube_views", name: "YouTube Views", unit: "views", value: (period) => period.views, aggregationMethod: "Sum" },
  { key: "youtube_watch_minutes", name: "YouTube Watch Time Minutes", unit: "minutes", value: (period) => period.estimatedMinutesWatched, aggregationMethod: "Sum" },
  { key: "youtube_average_view_duration_seconds", name: "YouTube Average View Duration", unit: "seconds", value: (period) => period.averageViewDurationSeconds, aggregationMethod: "Average" },
  { key: "youtube_likes", name: "YouTube Likes", unit: "likes", value: (period) => period.likes, aggregationMethod: "Sum" },
  { key: "youtube_comments", name: "YouTube Comments", unit: "comments", value: (period) => period.comments, aggregationMethod: "Sum" },
  { key: "youtube_subscribers_gained", name: "YouTube Subscribers Gained", unit: "subscribers", value: (period) => period.subscribersGained, aggregationMethod: "Sum" },
  { key: "youtube_subscribers_lost", name: "YouTube Subscribers Lost", unit: "subscribers", value: (period) => period.subscribersLost, aggregationMethod: "Sum" }
];

export class YouTubeConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "youtube",
    name: "YouTube Connector",
    sourceName: "YouTube",
    category: "video",
    mode: "api",
    enabled: true,
    description: "Imports native Elim Fellowship YouTube publishing and channel analytics through the YouTube Data and Analytics APIs."
  };

  async authenticate(context: ConnectorRunContext): Promise<ConnectorAuthResult> {
    if (!context.config.youtube.configured) return { ok: false, status: "Needs Setup", message: "Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET" };
    if (!context.config.youtube.refreshToken) return { ok: false, status: "Needs Setup", message: "Missing YOUTUBE_REFRESH_TOKEN" };
    try {
      const channel = await new YouTubeService(context.config).getAuthorizedChannel();
      if (channel.id !== ELIM_YOUTUBE_CHANNEL_ID) {
        return { ok: false, status: "Error", message: `YouTube OAuth resolved to ${channel.title} (${channel.id}) instead of the configured Elim Fellowship channel.` };
      }
      return { ok: true, status: "Connected", message: `YouTube API authenticated for ${channel.title}.` };
    } catch (error) {
      return { ok: false, status: "Error", message: `YouTube authentication failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const service = new YouTubeService(context.config);
    const periods = buildMonthlyPeriodsFrom(YOUTUBE_HISTORY_START_DATE, new Date());
    const rawMetrics: RawConnectorMetric[] = [];

    context.logger.info("YouTube history window", { historyStartDate: YOUTUBE_HISTORY_START_DATE, periodCount: periods.length });

    for (const period of periods) {
      const result = await service.fetchPeriodMetrics(period.startDate, period.endDate);
      if (result.channel.id !== ELIM_YOUTUBE_CHANNEL_ID) throw new Error(`YouTube sync resolved to unexpected channel ${result.channel.title} (${result.channel.id}).`);

      for (const definition of METRICS) {
        rawMetrics.push({
          sourceRecordId: `${definition.key}:${period.startDate}:${period.endDate}`,
          metricName: definition.name,
          value: definition.value(result),
          unit: definition.unit,
          date: period.startDate,
          targetTableKey: "kpiHistory",
          platform: "YouTube",
          channel: "YouTube",
          contentType: "Channel Analytics",
          activityVolume: definition.key === "youtube_videos_published" ? result.videosPublished : undefined,
          dimensions: {
            metricKey: definition.key,
            periodStart: period.startDate,
            periodEnd: period.endDate,
            periodType: "Monthly",
            aggregationMethod: definition.aggregationMethod,
            channelId: result.channel.id
          }
        });
      }

      context.logger.info("YouTube monthly analytics loaded", {
        channelId: result.channel.id,
        channelTitle: result.channel.title,
        startDate: period.startDate,
        endDate: period.endDate,
        videosPublished: result.videosPublished,
        views: result.views
      });
    }

    return rawMetrics;
  }

  async transformData(metrics: RawConnectorMetric[], _context: ConnectorRunContext): Promise<ConnectorAirtablePayload> {
    const normalized = metrics.map((metric) => this.normalizeMetric(metric));
    const syncedAt = new Date().toISOString();
    return {
      metrics: normalized,
      records: normalized.map((metric) => {
        const metricKey = String(metric.dimensions?.metricKey ?? "youtube_metric");
        const periodStart = String(metric.dimensions?.periodStart ?? metric.date);
        const periodEnd = String(metric.dimensions?.periodEnd ?? metric.date);
        const periodType = String(metric.dimensions?.periodType ?? "Monthly");
        const aggregationMethod = String(metric.dimensions?.aggregationMethod ?? "Sum");
        const uniqueKey = ["youtube", "kpi", metricKey, periodType.toLowerCase(), periodStart, periodEnd].join(":");
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
          "Aggregation Method": aggregationMethod,
          Channel: "YouTube",
          Platform: "YouTube",
          "Source Name": "YouTube",
          "Quality Status": "Complete",
          "Snapshot Date": periodEnd,
          "Reporting Month": periodStart.slice(0, 7),
          "Source Record ID": `youtube:${metricKey}:${periodStart}:${periodEnd}`,
          "Last Synced At": syncedAt
        };
        return { tableKey: "kpiHistory" as const, uniqueKey: { fieldName: "Unique Key", value: uniqueKey }, fields };
      })
    };
  }

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> { return []; }
}

function buildMonthlyPeriodsFrom(startDate: string, now: Date): ReportingPeriod[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime())) throw new Error(`Invalid YouTube history start date: ${startDate}`);

  const today = formatDate(now);
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const periods: ReportingPeriod[] = [];

  while (cursor <= currentMonthStart) {
    const monthStart = new Date(cursor);
    const isCurrentMonth = monthStart.getUTCFullYear() === now.getUTCFullYear() && monthStart.getUTCMonth() === now.getUTCMonth();
    const monthEnd = isCurrentMonth
      ? today
      : formatDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)));
    periods.push({ startDate: formatDate(monthStart), endDate: monthEnd });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return periods;
}

function formatDate(value: Date): string { return value.toISOString().slice(0, 10); }
