import type { AppConfig } from "../config/env.js";
import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";
import { CommunicationsAnalyticsService } from "./communicationsAnalyticsService.js";
import { calculatePercentChange } from "./kpiCalculationEngine.js";
import { dateField, stringField, type Fields } from "./communicationsIntelligenceModel.js";

interface ChannelLike {
  key?: string;
  label?: string;
  metricLabel?: string;
  color?: string;
  activityVolume?: number;
  metricValue?: number;
  previousMetricValue?: number;
  changePercent?: number;
  source?: string;
  hasData?: boolean;
  metricAvailable?: boolean;
  metricNote?: string;
  series?: Array<{ date: string; value: number }>;
}

interface DateRangeLike {
  startDate?: string;
  endDate?: string;
  mode?: string;
}

export class CastosAwareCommunicationsAnalyticsService extends CommunicationsAnalyticsService {
  constructor(config: AppConfig, private readonly liveAirtable: AirtableService) {
    super(config, liveAirtable);
  }

  override async getChannelBreakdown(query: {
    startDate?: string;
    endDate?: string;
    dateMode?: string;
  } = {}): Promise<Record<string, unknown>> {
    const base = await super.getChannelBreakdown(query) as Record<string, any>;
    const contentPerformance = await this.liveAirtable.getRecords("contentPerformance", {
      maxRecords: 1000
    });

    const dateRange = (base.dateRange ?? {}) as DateRangeLike;
    const previousDateRange = (base.previousDateRange ?? {}) as DateRangeLike;
    const currentCastos = filterCastosEpisodes(contentPerformance, dateRange);
    const previousCastos = filterCastosEpisodes(contentPerformance, previousDateRange);
    const channels = Array.isArray(base.channels) ? [...base.channels] as ChannelLike[] : [];
    const castosIndex = channels.findIndex((channel) => channel.key === "castos");
    const priorCastos = castosIndex >= 0 ? channels[castosIndex] : undefined;

    const castosChannel: ChannelLike = {
      key: "castos",
      label: priorCastos?.label ?? "Castos",
      metricLabel: "Downloads / Listens",
      color: priorCastos?.color ?? "#6d28d9",
      activityVolume: currentCastos.length,
      metricValue: 0,
      previousMetricValue: 0,
      changePercent: undefined,
      source: "Content_Performance",
      hasData: currentCastos.length > 0,
      metricAvailable: false,
      metricNote: "Audience analytics are not available from the connected Castos API.",
      series: []
    };

    if (castosIndex >= 0) {
      channels[castosIndex] = castosChannel;
    } else {
      channels.push(castosChannel);
    }

    const comparable = channels.filter(
      (channel) => channel.hasData && channel.metricAvailable !== false
    );
    const currentTotal = comparable.reduce(
      (sum, channel) => sum + finiteNumber(channel.metricValue),
      0
    );
    const previousTotal = comparable.reduce(
      (sum, channel) => sum + finiteNumber(channel.previousMetricValue),
      0
    );

    return {
      ...base,
      channels,
      summary: {
        ...(base.summary ?? {}),
        currentValue: currentTotal,
        previousValue: previousTotal,
        changePercent: comparable.length
          ? calculatePercentChange(currentTotal, previousTotal)
          : undefined,
        channelCount: comparable.length
      },
      castosDataState: {
        activitySource: "Content_Performance",
        currentEpisodesPublished: currentCastos.length,
        previousEpisodesPublished: previousCastos.length,
        audienceMetricAvailable: false
      },
      trends: {
        ...(base.trends ?? {}),
        channels: channels.map((channel) => ({
          key: channel.key,
          label: channel.label,
          color: channel.color,
          metricLabel: channel.metricLabel,
          series: channel.series ?? []
        }))
      }
    };
  }
}

function filterCastosEpisodes(
  records: Array<NormalizedAirtableRecord<Fields>>,
  range: DateRangeLike
): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => {
    if (!isCastosEpisode(record.fields)) return false;
    if (!range.startDate || !range.endDate) return true;
    const date = dateField(record.fields, ["Publish Date", "Published At", "Date", "Created At"]);
    return Boolean(date && date >= range.startDate && date <= range.endDate);
  });
}

function isCastosEpisode(fields: Fields): boolean {
  const source = [
    stringField(fields, ["Platform"], ""),
    stringField(fields, ["Source Platform"], ""),
    stringField(fields, ["Source"], ""),
    stringField(fields, ["Source Name"], "")
  ].join(" ").toLowerCase();
  if (!source.includes("castos")) return false;

  const typeAndMetric = [
    stringField(fields, ["Content Type"], ""),
    stringField(fields, ["Metric Type"], ""),
    stringField(fields, ["Metric"], ""),
    stringField(fields, ["KPI"], "")
  ].join(" ").toLowerCase();

  return typeAndMetric.includes("podcast") || typeAndMetric.includes("published");
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
