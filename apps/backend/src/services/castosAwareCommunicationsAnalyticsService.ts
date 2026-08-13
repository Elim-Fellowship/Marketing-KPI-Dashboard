import type { AppConfig } from "../config/env.js";
import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";
import { CommunicationsAnalyticsService } from "./communicationsAnalyticsService.js";
import { calculatePercentChange } from "./kpiCalculationEngine.js";
import { dateField, numberField, stringField, type Fields } from "./communicationsIntelligenceModel.js";

interface ChannelLike { key?: string; label?: string; metricLabel?: string; color?: string; activityVolume?: number; metricValue?: number; previousMetricValue?: number; changePercent?: number; source?: string; hasData?: boolean; metricAvailable?: boolean; metricNote?: string; series?: Array<{ date: string; value: number }>; }
interface DateRangeLike { startDate?: string; endDate?: string; mode?: string; }

export class CastosAwareCommunicationsAnalyticsService extends CommunicationsAnalyticsService {
  constructor(config: AppConfig, private readonly liveAirtable: AirtableService) { super(config, liveAirtable); }

  override async getChannelBreakdown(query: { startDate?: string; endDate?: string; dateMode?: string } = {}): Promise<Record<string, unknown>> {
    const base = await super.getChannelBreakdown(query) as Record<string, any>;
    const [contentPerformance, kpiHistory] = await Promise.all([
      this.liveAirtable.getRecords("contentPerformance", { maxRecords: 1000 }),
      this.liveAirtable.getRecords("kpiHistory", { maxRecords: 1000 })
    ]);
    const dateRange = (base.dateRange ?? {}) as DateRangeLike;
    const previousDateRange = (base.previousDateRange ?? {}) as DateRangeLike;
    const currentCastos = filterCastosEpisodes(contentPerformance, dateRange);
    const previousCastos = filterCastosEpisodes(contentPerformance, previousDateRange);
    const channels = Array.isArray(base.channels) ? [...base.channels] as ChannelLike[] : [];

    replaceCastosChannel(channels, currentCastos, previousCastos);
    replaceEmailChannel(channels, kpiHistory, dateRange, previousDateRange);
    replaceYouTubeChannel(channels, kpiHistory, dateRange, previousDateRange);
    replaceGa4Channel(channels, kpiHistory, "website", "Website", "ga4_website_sessions", "ga4_website_page_views", dateRange, previousDateRange);
    replaceGa4Channel(channels, kpiHistory, "voiceOfElim", "Voice of Elim", "ga4_voice_of_elim_publications", "ga4_voice_of_elim_page_views", dateRange, previousDateRange);
    replaceGa4Channel(channels, kpiHistory, "elimUpdates", "Elim Updates", "ga4_elim_updates_publications", "ga4_elim_updates_page_views", dateRange, previousDateRange);

    const comparable = channels.filter((channel) => channel.hasData && channel.metricAvailable !== false);
    const currentTotal = comparable.reduce((sum, channel) => sum + finiteNumber(channel.metricValue), 0);
    const previousTotal = comparable.reduce((sum, channel) => sum + finiteNumber(channel.previousMetricValue), 0);
    return {
      ...base,
      channels,
      summary: { ...(base.summary ?? {}), currentValue: currentTotal, previousValue: previousTotal, changePercent: comparable.length ? calculatePercentChange(currentTotal, previousTotal) : undefined, channelCount: comparable.length },
      castosDataState: { activitySource: "Content_Performance", currentEpisodesPublished: currentCastos.length, previousEpisodesPublished: previousCastos.length, audienceMetricAvailable: false },
      trends: { ...(base.trends ?? {}), channels: channels.map((channel) => ({ key: channel.key, label: channel.label, color: channel.color, metricLabel: channel.metricLabel, series: channel.series ?? [] })) }
    };
  }
}

function replaceCastosChannel(channels: ChannelLike[], currentCastos: Array<NormalizedAirtableRecord<Fields>>, previousCastos: Array<NormalizedAirtableRecord<Fields>>): void {
  const index = channels.findIndex((channel) => channel.key === "castos");
  const prior = index >= 0 ? channels[index] : undefined;
  const channel: ChannelLike = { key: "castos", label: prior?.label ?? "Castos", metricLabel: "Downloads / Listens", color: prior?.color ?? "#6d28d9", activityVolume: currentCastos.length, metricValue: 0, previousMetricValue: 0, changePercent: undefined, source: "Content_Performance", hasData: currentCastos.length > 0, metricAvailable: false, metricNote: "Audience analytics are not available from the connected Castos API.", series: [] };
  if (index >= 0) channels[index] = channel; else channels.push(channel);
}

function replaceEmailChannel(channels: ChannelLike[], kpiHistory: Array<NormalizedAirtableRecord<Fields>>, currentRange: DateRangeLike, previousRange: DateRangeLike): void {
  const index = channels.findIndex((channel) => channel.key === "email"); if (index < 0) return;
  const currentCampaigns = findSourceMetric(kpiHistory, "mailchimp", "campaigns_sent", currentRange);
  const currentClickRate = findSourceMetric(kpiHistory, "mailchimp", "email_click_rate", currentRange);
  const previousClickRate = findSourceMetric(kpiHistory, "mailchimp", "email_click_rate", previousRange);
  if (!currentCampaigns && !currentClickRate) return;
  const prior = channels[index];
  const currentClicks = currentClickRate ? numberField(currentClickRate.fields, ["Numerator"]) : finiteNumber(prior.metricValue);
  const previousClicks = previousClickRate ? numberField(previousClickRate.fields, ["Numerator"]) : finiteNumber(prior.previousMetricValue);
  const campaignCount = currentCampaigns ? numberField(currentCampaigns.fields, ["Value"]) : finiteNumber(prior.activityVolume);
  channels[index] = { ...prior, activityVolume: campaignCount, metricLabel: "Clicks", metricValue: currentClicks, previousMetricValue: previousClicks, changePercent: calculatePercentChange(currentClicks, previousClicks), source: "KPI_History / Mailchimp", hasData: campaignCount > 0 || currentClicks > 0, metricAvailable: true };
}

function replaceYouTubeChannel(channels: ChannelLike[], kpiHistory: Array<NormalizedAirtableRecord<Fields>>, currentRange: DateRangeLike, previousRange: DateRangeLike): void {
  const index = channels.findIndex((channel) => channel.key === "youtube"); if (index < 0) return;
  const currentVideos = findSourceMetric(kpiHistory, "youtube", "youtube_videos_published", currentRange);
  const currentViews = findSourceMetric(kpiHistory, "youtube", "youtube_views", currentRange);
  const previousViews = findSourceMetric(kpiHistory, "youtube", "youtube_views", previousRange);
  if (!currentVideos && !currentViews) return;
  const prior = channels[index];
  const videoCount = currentVideos ? numberField(currentVideos.fields, ["Value"]) : finiteNumber(prior.activityVolume);
  const views = currentViews ? numberField(currentViews.fields, ["Value"]) : finiteNumber(prior.metricValue);
  const previousViewCount = previousViews ? numberField(previousViews.fields, ["Value"]) : finiteNumber(prior.previousMetricValue);
  channels[index] = { ...prior, activityVolume: videoCount, metricLabel: "Views", metricValue: views, previousMetricValue: previousViewCount, changePercent: calculatePercentChange(views, previousViewCount), source: "KPI_History / YouTube", hasData: videoCount > 0 || views > 0, metricAvailable: true };
}

function replaceGa4Channel(channels: ChannelLike[], kpiHistory: Array<NormalizedAirtableRecord<Fields>>, channelKey: string, label: string, activityKey: string, viewsKey: string, currentRange: DateRangeLike, previousRange: DateRangeLike): void {
  const index = channels.findIndex((channel) => channel.key === channelKey); if (index < 0) return;
  const currentActivity = findSourceMetric(kpiHistory, "google analytics 4", activityKey, currentRange);
  const currentViews = findSourceMetric(kpiHistory, "google analytics 4", viewsKey, currentRange);
  const previousViews = findSourceMetric(kpiHistory, "google analytics 4", viewsKey, previousRange);
  if (!currentActivity && !currentViews) return;
  const prior = channels[index];
  const activity = currentActivity ? numberField(currentActivity.fields, ["Value"]) : finiteNumber(prior.activityVolume);
  const views = currentViews ? numberField(currentViews.fields, ["Value"]) : finiteNumber(prior.metricValue);
  const previous = previousViews ? numberField(previousViews.fields, ["Value"]) : finiteNumber(prior.previousMetricValue);
  channels[index] = { ...prior, label, activityVolume: activity, metricLabel: "Page Views", metricValue: views, previousMetricValue: previous, changePercent: calculatePercentChange(views, previous), source: "KPI_History / Google Analytics 4", hasData: activity > 0 || views > 0, metricAvailable: true };
}

function findSourceMetric(records: Array<NormalizedAirtableRecord<Fields>>, sourceTerm: string, metricKey: string, range: DateRangeLike): NormalizedAirtableRecord<Fields> | undefined {
  const candidates = records.filter((record) => {
    const source = [stringField(record.fields, ["Source Name"], ""), stringField(record.fields, ["Source"], ""), stringField(record.fields, ["Platform"], ""), stringField(record.fields, ["Channel"], "")].join(" ").toLowerCase();
    if (!source.includes(sourceTerm.toLowerCase())) return false;
    const key = stringField(record.fields, ["Metric Key"], "").toLowerCase(); if (key !== metricKey.toLowerCase()) return false;
    if (!range.startDate || !range.endDate) return true;
    const start = stringField(record.fields, ["Period Start", "Date"], ""); const end = stringField(record.fields, ["Period End", "Snapshot Date", "Date"], "");
    return start === range.startDate && end === range.endDate;
  });
  return candidates.find((record) => stringField(record.fields, ["Period Type"], "").toLowerCase() === "monthly") ?? candidates[0];
}

function filterCastosEpisodes(records: Array<NormalizedAirtableRecord<Fields>>, range: DateRangeLike): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => { if (!isCastosEpisode(record.fields)) return false; if (!range.startDate || !range.endDate) return true; const date = dateField(record.fields, ["Publish Date", "Published At", "Date", "Created At"]); return Boolean(date && date >= range.startDate && date <= range.endDate); });
}
function isCastosEpisode(fields: Fields): boolean {
  const source = [stringField(fields, ["Platform"], ""), stringField(fields, ["Source Platform"], ""), stringField(fields, ["Source"], ""), stringField(fields, ["Source Name"], "")].join(" ").toLowerCase(); if (!source.includes("castos")) return false;
  const typeAndMetric = [stringField(fields, ["Content Type"], ""), stringField(fields, ["Metric Type"], ""), stringField(fields, ["Metric"], ""), stringField(fields, ["KPI"], "")].join(" ").toLowerCase(); return typeAndMetric.includes("podcast") || typeAndMetric.includes("published");
}
function finiteNumber(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
