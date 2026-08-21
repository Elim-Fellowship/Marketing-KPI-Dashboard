import type { AppConfig } from "../config/env.js";
import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";
import { CommunicationsAnalyticsService } from "./communicationsAnalyticsService.js";
import { calculatePercentChange } from "./kpiCalculationEngine.js";
import { dateField, numberField, stringField, type Fields } from "./communicationsIntelligenceModel.js";

interface ChannelLike { key?: string; label?: string; metricLabel?: string; color?: string; activityVolume?: number; metricValue?: number; previousMetricValue?: number; changePercent?: number; source?: string; hasData?: boolean; metricAvailable?: boolean; metricNote?: string; series?: Array<{ date: string; value: number }>; }
interface DateRangeLike { startDate?: string; endDate?: string; mode?: string; }
interface ActivityItem { value: number; available: boolean; source: string; metricKey?: string; note?: string; }
interface EngagementAggregate { value: number; available: boolean; }
interface SpotifyAudienceAggregate { value: number; available: boolean; matchedDays: number; series: Array<{ date: string; value: number }>; }
interface TopContentItemLike { rank?: number; type?: string; platform?: string; sourceName?: string; [key: string]: unknown; }
interface TopContentGroupLike { items?: TopContentItemLike[]; itemCount?: number; topItem?: TopContentItemLike; [key: string]: unknown; }

export class CastosAwareCommunicationsAnalyticsService extends CommunicationsAnalyticsService {
  constructor(config: AppConfig, private readonly liveAirtable: AirtableService) { super(config, liveAirtable); }

  override async getTopContent(query: { timeframe?: string; platform?: string; groupBy?: string }): Promise<Record<string, unknown>> {
    const base = await super.getTopContent(query) as Record<string, any>;
    const podcasts = Array.isArray(base.sections?.podcasts) ? base.sections.podcasts as TopContentItemLike[] : [];
    const hasCastosPodcast = podcasts.some(isCastosTopContentItem);
    if (!hasCastosPodcast) {
      return {
        ...base,
        podcastSourcePreference: {
          authoritativeSource: "Spotify",
          fallbackUsed: true,
          reason: "No Castos episode-level records are available for the selected Top Content dataset."
        }
      };
    }

    const filteredPodcasts = rerankTopContentItems(podcasts.filter((item) => !isSpotifyPodcastItem(item)));
    const topOverall = rerankTopContentItems(
      (Array.isArray(base.topOverall) ? base.topOverall as TopContentItemLike[] : [])
        .filter((item) => !isSpotifyPodcastItem(item))
    );
    const groups = (Array.isArray(base.groups) ? base.groups as TopContentGroupLike[] : []).map((group) => {
      if (!Array.isArray(group.items)) return group;
      const items = rerankTopContentItems(group.items.filter((item) => !isSpotifyPodcastItem(item)));
      return {
        ...group,
        items,
        itemCount: items.length,
        topItem: items[0]
      };
    });
    const removedSpotifyPodcastCount = podcasts.filter(isSpotifyPodcastItem).length;

    return {
      ...base,
      sections: {
        ...(base.sections ?? {}),
        podcasts: filteredPodcasts
      },
      topOverall,
      groups,
      totalRankedItems: Math.max(0, Number(base.totalRankedItems ?? 0) - removedSpotifyPodcastCount),
      podcastSourcePreference: {
        authoritativeSource: "Castos",
        fallbackUsed: false,
        removedSpotifyPodcastCount,
        reason: "Castos episode-level listens are available, so Spotify episode rows are excluded from Top Podcast and overall rankings to avoid overlapping podcast representations."
      }
    };
  }

  override async getOverview(query: { startDate?: string; endDate?: string; dateMode?: string } = {}): Promise<Record<string, unknown>> {
    const base = await super.getOverview(query) as Record<string, any>;
    const [contentPerformance, kpiHistory, bufferPosts] = await Promise.all([
      this.liveAirtable.getRecords("contentPerformance", { maxRecords: 1000 }),
      this.liveAirtable.getRecords("kpiHistory", { maxRecords: 1000 }),
      this.liveAirtable.getRecords("bufferPostMetrics", { maxRecords: 2000 })
    ]);
    const dateRange = (base.dateRange ?? {}) as DateRangeLike;

    const emailRecord = findSourceMetric(kpiHistory, "mailchimp", "emails_sent", dateRange);
    const campaignRecord = findSourceMetric(kpiHistory, "mailchimp", "campaigns_sent", dateRange);
    const castosPublicationCoverage = filterCastosPublishedEpisodes(contentPerformance, {});
    const castosPublished = filterCastosPublishedEpisodes(contentPerformance, dateRange);
    const bufferSummary = summarizeBufferPublishedPosts(bufferPosts, dateRange);

    const items: Record<string, ActivityItem> = {
      emailsSent: activityItem(emailRecord, "KPI_History / Mailchimp", "emails_sent"),
      podcastsPublished: {
        value: castosPublished.length,
        available: castosPublicationCoverage.length > 0,
        source: "Content_Performance / Castos",
        metricKey: "Podcasts Published",
        note: "Counts Castos publication records with Metric Type 'Podcasts Published' whose Publish Date falls inside the selected reporting range."
      },
      socialPostsPublished: {
        value: bufferSummary.count,
        available: bufferSummary.available,
        source: "Buffer_Post_Metrics / Buffer",
        note: "Counts distinct Buffer post IDs published to a channel in the selected reporting range."
      },
      emailCampaignsSent: activityItem(campaignRecord, "KPI_History / Mailchimp", "campaigns_sent")
    };

    const hasData = Object.values(items).some((item) => item.available);
    const monthlyActivitySummary = {
      hasData,
      emailsSent: items.emailsSent.available ? items.emailsSent.value : 0,
      podcastsPublished: items.podcastsPublished.available ? items.podcastsPublished.value : 0,
      socialPostsPublished: items.socialPostsPublished.available ? items.socialPostsPublished.value : 0,
      emailCampaignsSent: items.emailCampaignsSent.available ? items.emailCampaignsSent.value : 0,
      items
    };

    return {
      ...base,
      monthlyActivitySummary,
      rawCounts: {
        ...(base.rawCounts ?? {}),
        contentPerformance: contentPerformance.length,
        bufferPostMetrics: bufferPosts.length
      }
    };
  }

  override async getEngagement(query: { startDate?: string; endDate?: string; dateMode?: string } = {}): Promise<Record<string, unknown>> {
    const base = await super.getEngagement(query) as Record<string, any>;
    const [kpiHistory, bufferMetrics] = await Promise.all([
      this.liveAirtable.getRecords("kpiHistory", { maxRecords: 1000 }),
      this.liveAirtable.getRecords("bufferPostMetrics", { maxRecords: 2000 })
    ]);
    const dateRange = (base.dateRange ?? {}) as DateRangeLike;
    const previousDateRange = (base.previousDateRange ?? {}) as DateRangeLike;

    const currentSocial = summarizeBufferEngagements(bufferMetrics, dateRange);
    const previousSocial = summarizeBufferEngagements(bufferMetrics, previousDateRange);
    const currentPodcast = aggregateMetricRecords(filterSpotifyKpiRecords(kpiHistory, "spotify_consumption_hours", dateRange));
    const previousPodcast = aggregateMetricRecords(filterSpotifyKpiRecords(kpiHistory, "spotify_consumption_hours", previousDateRange));
    const currentWebsite = activityAggregate(findSourceMetric(kpiHistory, "google analytics 4", "ga4_website_active_users", dateRange));
    const previousWebsite = activityAggregate(findSourceMetric(kpiHistory, "google analytics 4", "ga4_website_active_users", previousDateRange));
    const currentOpens = activityAggregate(findSourceMetric(kpiHistory, "mailchimp", "email_opens", dateRange));
    const previousOpens = activityAggregate(findSourceMetric(kpiHistory, "mailchimp", "email_opens", previousDateRange));
    const currentClicks = activityAggregate(findSourceMetric(kpiHistory, "mailchimp", "email_clicks", dateRange));
    const previousClicks = activityAggregate(findSourceMetric(kpiHistory, "mailchimp", "email_clicks", previousDateRange));
    const currentSubscribers = activityAggregate(findSourceMetric(kpiHistory, "mailchimp", "new_subscribers", dateRange));
    const previousSubscribers = activityAggregate(findSourceMetric(kpiHistory, "mailchimp", "new_subscribers", previousDateRange));

    return {
      dateRange,
      previousDateRange,
      engagementCards: [
        engagementCard("social_engagements", "Social Engagements", currentSocial, previousSocial),
        engagementCard("podcast_listening_hours", "Podcast Listening Hours", currentPodcast, previousPodcast),
        engagementCard("website_active_users", "Website Active Users", currentWebsite, previousWebsite),
        engagementCard("email_opens", "Email Opens", currentOpens, previousOpens),
        engagementCard("email_clicks", "Email Clicks", currentClicks, previousClicks),
        engagementCard("new_email_subscribers", "New Email Subscribers", currentSubscribers, previousSubscribers)
      ]
    };
  }

  override async getChannelBreakdown(query: { startDate?: string; endDate?: string; dateMode?: string } = {}): Promise<Record<string, unknown>> {
    const base = await super.getChannelBreakdown(query) as Record<string, any>;
    const [contentPerformance, kpiHistory, spotifyEpisodes] = await Promise.all([
      this.liveAirtable.getRecords("contentPerformance", { maxRecords: 1000 }),
      this.liveAirtable.getRecords("kpiHistory", { maxRecords: 1000 }),
      this.liveAirtable.getRecords("spotifyEpisodeMetrics", { maxRecords: 1000 })
    ]);
    const dateRange = (base.dateRange ?? {}) as DateRangeLike;
    const previousDateRange = (base.previousDateRange ?? {}) as DateRangeLike;
    const currentCastos = filterCastosPublishedEpisodes(contentPerformance, dateRange);
    const previousCastos = filterCastosPublishedEpisodes(contentPerformance, previousDateRange);
    const currentCastosListens = findSourceMetric(kpiHistory, "castos", "castos_listens", dateRange);
    const previousCastosListens = findSourceMetric(kpiHistory, "castos", "castos_listens", previousDateRange);
    const currentSpotify = filterSpotifyEpisodes(spotifyEpisodes, dateRange);
    const previousSpotify = filterSpotifyEpisodes(spotifyEpisodes, previousDateRange);
    const currentSpotifyConsumption = filterSpotifyKpiRecords(kpiHistory, "spotify_consumption_hours", dateRange);
    const previousSpotifyConsumption = filterSpotifyKpiRecords(kpiHistory, "spotify_consumption_hours", previousDateRange);
    const currentSpotifyAverageConsumption = filterSpotifyKpiRecords(kpiHistory, "spotify_average_consumption_hours", dateRange);
    const previousSpotifyAverageConsumption = filterSpotifyKpiRecords(kpiHistory, "spotify_average_consumption_hours", previousDateRange);
    const currentSpotifyTopEpisodes = filterSpotifyKpiRecords(kpiHistory, "spotify_episode_consumption_hours", dateRange);
    const previousSpotifyTopEpisodes = filterSpotifyKpiRecords(kpiHistory, "spotify_episode_consumption_hours", previousDateRange);
    const channels = Array.isArray(base.channels) ? [...base.channels] as ChannelLike[] : [];

    const usingNormalizedSpotify = currentSpotifyConsumption.length > 0 && currentSpotifyAverageConsumption.length > 0;
    if (usingNormalizedSpotify) {
      replaceSpotifyAudienceChannel(channels, currentSpotifyConsumption, currentSpotifyAverageConsumption, previousSpotifyConsumption, previousSpotifyAverageConsumption, currentSpotifyTopEpisodes);
    } else {
      replaceSpotifyChannel(channels, currentSpotify, previousSpotify);
    }
    replaceCastosChannel(channels, currentCastos, previousCastos, currentCastosListens, previousCastosListens);
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
      spotifyDataState: usingNormalizedSpotify
        ? { source: "KPI_History / Spotify", currentEpisodesTracked: currentSpotifyTopEpisodes.length, previousEpisodesTracked: previousSpotifyTopEpisodes.length, metric: "Audience Activity", derivation: "Consumption Time / Average Consumption Time" }
        : { source: "Spotify_Episode_Metrics", currentEpisodesPublished: currentSpotify.length, previousEpisodesPublished: previousSpotify.length, metric: "Streams" },
      castosDataState: { activitySource: "Content_Performance", audienceSource: "KPI_History / Castos", currentEpisodesPublished: currentCastos.length, previousEpisodesPublished: previousCastos.length, audienceMetricAvailable: Boolean(currentCastosListens), metric: "Downloads / Listens" },
      trends: { ...(base.trends ?? {}), channels: channels.map((channel) => ({ key: channel.key, label: channel.label, color: channel.color, metricLabel: channel.metricLabel, series: channel.series ?? [] })) }
    };
  }
}

function isCastosTopContentItem(item: TopContentItemLike): boolean {
  return String(item.type ?? "").toLowerCase() === "podcast" && String(item.sourceName ?? "").toLowerCase() === "castos";
}

function isSpotifyPodcastItem(item: TopContentItemLike): boolean {
  return String(item.type ?? "").toLowerCase() === "podcast" && String(item.sourceName ?? "").toLowerCase() === "spotify";
}

function rerankTopContentItems(items: TopContentItemLike[]): TopContentItemLike[] {
  return items.map((item, index) => ({ ...item, rank: index + 1 }));
}

function activityItem(record: NormalizedAirtableRecord<Fields> | undefined, source: string, metricKey: string): ActivityItem {
  return {
    value: record ? numberField(record.fields, ["Value"]) : 0,
    available: Boolean(record),
    source,
    metricKey
  };
}

function activityAggregate(record: NormalizedAirtableRecord<Fields> | undefined): EngagementAggregate {
  return { value: record ? numberField(record.fields, ["Value"]) : 0, available: Boolean(record) };
}

function aggregateMetricRecords(records: Array<NormalizedAirtableRecord<Fields>>): EngagementAggregate {
  return {
    value: records.reduce((sum, record) => sum + numberField(record.fields, ["Value"]), 0),
    available: records.length > 0
  };
}

function engagementCard(id: string, label: string, current: EngagementAggregate, previous: EngagementAggregate): Record<string, unknown> {
  const hasComparison = current.available && previous.available;
  return {
    id,
    label,
    currentValue: current.available ? current.value : 0,
    currentLabel: label,
    previousValue: hasComparison ? previous.value : undefined,
    changePercent: hasComparison ? calculatePercentChange(current.value, previous.value) : undefined,
    hasComparison,
    hasData: current.available
  };
}

function summarizeBufferEngagements(records: Array<NormalizedAirtableRecord<Fields>>, range: DateRangeLike): EngagementAggregate {
  if (!range.startDate || !range.endDate) return { value: 0, available: false };
  let total = 0;
  let available = false;
  for (const record of records) {
    const date = dateField(record.fields, ["Metric Date", "Date"]);
    if (!date || date < range.startDate || date > range.endDate) continue;
    const metricName = stringField(record.fields, ["Metric Name", "Metric", "Type"], "").toLowerCase();
    if (!metricName.includes("reaction") && !metricName.includes("comment") && !metricName.includes("share")) continue;
    available = true;
    total += numberField(record.fields, ["Metric Value", "Value", "Count"]);
  }
  return { value: total, available };
}

function summarizeBufferPublishedPosts(records: Array<NormalizedAirtableRecord<Fields>>, range: DateRangeLike): { count: number; available: boolean } {
  if (!records.length || !range.startDate || !range.endDate) return { count: 0, available: false };
  const dated = records
    .map((record) => ({ record, date: dateField(record.fields, ["Metric Date", "Published At", "Publish Date", "Date", "Sent At"]) }))
    .filter((entry) => Boolean(entry.date));
  if (!dated.length) return { count: 0, available: false };

  const earliestDate = dated.reduce((earliest, entry) => !earliest || entry.date < earliest ? entry.date : earliest, "");
  const available = range.endDate >= earliestDate;
  const postIds = new Set<string>();
  for (const entry of dated) {
    if (entry.date < range.startDate || entry.date > range.endDate) continue;
    const sourceId = bufferOriginalSourceRecordId(entry.record.fields);
    if (sourceId) postIds.add(sourceId);
  }
  return { count: postIds.size, available };
}

function bufferOriginalSourceRecordId(fields: Fields): string {
  const dimensionsRaw = stringField(fields, ["Dimensions"], "");
  if (dimensionsRaw) {
    try {
      const dimensions = JSON.parse(dimensionsRaw) as { sourceRecordId?: unknown };
      const sourceRecordId = String(dimensions.sourceRecordId ?? "").trim();
      if (sourceRecordId) return sourceRecordId;
    } catch { /* fall through */ }
  }
  const metricRowId = stringField(fields, ["Source Record ID"], "");
  const metricName = stringField(fields, ["Metric Name"], "");
  const metricDate = stringField(fields, ["Metric Date"], "");
  const suffix = [metricName, metricDate].filter(Boolean).join(":").toLowerCase().replace(/\s+/g, "-");
  if (suffix && metricRowId.toLowerCase().endsWith(`:${suffix}`)) return metricRowId.slice(0, -(suffix.length + 1));
  return metricRowId;
}

function replaceSpotifyAudienceChannel(channels: ChannelLike[], currentConsumption: Array<NormalizedAirtableRecord<Fields>>, currentAverage: Array<NormalizedAirtableRecord<Fields>>, previousConsumption: Array<NormalizedAirtableRecord<Fields>>, previousAverage: Array<NormalizedAirtableRecord<Fields>>, currentTopEpisodes: Array<NormalizedAirtableRecord<Fields>>): void {
  const index = channels.findIndex((channel) => channel.key === "spotify");
  const prior = index >= 0 ? channels[index] : undefined;
  const currentAudience = deriveSpotifyAudienceActivity(currentConsumption, currentAverage);
  const previousAudience = deriveSpotifyAudienceActivity(previousConsumption, previousAverage);
  const channel: ChannelLike = {
    key: "spotify",
    label: prior?.label ?? "Spotify",
    metricLabel: "Audience Activity",
    color: prior?.color ?? "#1DB954",
    activityVolume: currentTopEpisodes.length,
    metricValue: currentAudience.value,
    previousMetricValue: previousAudience.available ? previousAudience.value : undefined,
    changePercent: currentAudience.available && previousAudience.available ? calculatePercentChange(currentAudience.value, previousAudience.value) : undefined,
    source: "KPI_History / Spotify",
    hasData: currentTopEpisodes.length > 0 || currentAudience.available,
    metricAvailable: currentAudience.available,
    metricNote: currentAudience.available ? `Derived from Consumption Time / Average Consumption Time across ${currentAudience.matchedDays} day${currentAudience.matchedDays === 1 ? "" : "s"}.` : "Spotify audience activity could not be derived for the selected reporting period.",
    series: currentAudience.series
  };
  if (index >= 0) channels[index] = channel; else channels.push(channel);
}

function deriveSpotifyAudienceActivity(consumptionRecords: Array<NormalizedAirtableRecord<Fields>>, averageRecords: Array<NormalizedAirtableRecord<Fields>>): SpotifyAudienceAggregate {
  const averageByDate = new Map<string, number>();
  for (const record of averageRecords) {
    const date = dateField(record.fields, ["Date", "Snapshot Date"]);
    const average = numberField(record.fields, ["Value"]);
    if (date && average > 0) averageByDate.set(date, average);
  }

  const points = new Map<string, number>();
  for (const record of consumptionRecords) {
    const date = dateField(record.fields, ["Date", "Snapshot Date"]);
    if (!date) continue;
    const consumption = numberField(record.fields, ["Value"]);
    const average = averageByDate.get(date) ?? 0;
    if (consumption <= 0 || average <= 0) continue;
    const estimatedEvents = Math.round(consumption / average);
    if (estimatedEvents <= 0) continue;
    points.set(date, estimatedEvents);
  }

  const series = [...points.entries()].map(([date, value]) => ({ date, value })).sort((left, right) => left.date.localeCompare(right.date));
  return {
    value: series.reduce((sum, point) => sum + point.value, 0),
    available: series.length > 0,
    matchedDays: series.length,
    series
  };
}

function replaceSpotifyChannel(channels: ChannelLike[], currentSpotify: Array<NormalizedAirtableRecord<Fields>>, previousSpotify: Array<NormalizedAirtableRecord<Fields>>): void {
  const index = channels.findIndex((channel) => channel.key === "spotify");
  const prior = index >= 0 ? channels[index] : undefined;
  const currentStreams = sumSpotifyStreams(currentSpotify);
  const previousStreams = sumSpotifyStreams(previousSpotify);
  const channel: ChannelLike = {
    key: "spotify",
    label: prior?.label ?? "Spotify",
    metricLabel: "Streams",
    color: prior?.color ?? "#1DB954",
    activityVolume: currentSpotify.length,
    metricValue: currentStreams,
    previousMetricValue: previousStreams,
    changePercent: previousStreams > 0 ? calculatePercentChange(currentStreams, previousStreams) : undefined,
    source: "Spotify_Episode_Metrics",
    hasData: currentSpotify.length > 0,
    metricAvailable: true,
    series: buildSpotifySeries(currentSpotify)
  };
  if (index >= 0) channels[index] = channel; else channels.push(channel);
}

function sumSpotifyStreams(records: Array<NormalizedAirtableRecord<Fields>>): number {
  return records.reduce((sum, record) => sum + numberField(record.fields, ["Total Streams", "Streams", "Plays", "Value"]), 0);
}

function buildSpotifySeries(records: Array<NormalizedAirtableRecord<Fields>>): Array<{ date: string; value: number }> {
  const points = new Map<string, number>();
  for (const record of records) {
    const date = dateField(record.fields, ["Publish Date", "Reporting Week", "Reporting Month", "Date", "Week", "Snapshot Date"]);
    if (!date) continue;
    points.set(date, (points.get(date) ?? 0) + numberField(record.fields, ["Total Streams", "Streams", "Plays", "Value"]));
  }
  return [...points.entries()].map(([date, value]) => ({ date, value })).sort((left, right) => left.date.localeCompare(right.date));
}

function buildMetricSeries(records: Array<NormalizedAirtableRecord<Fields>>): Array<{ date: string; value: number }> {
  const points = new Map<string, number>();
  for (const record of records) {
    const date = dateField(record.fields, ["Date", "Snapshot Date", "Period End"]);
    if (!date) continue;
    points.set(date, (points.get(date) ?? 0) + numberField(record.fields, ["Value"]));
  }
  return [...points.entries()].map(([date, value]) => ({ date, value })).sort((left, right) => left.date.localeCompare(right.date));
}

function replaceCastosChannel(channels: ChannelLike[], currentCastos: Array<NormalizedAirtableRecord<Fields>>, previousCastos: Array<NormalizedAirtableRecord<Fields>>, currentListens: NormalizedAirtableRecord<Fields> | undefined, previousListens: NormalizedAirtableRecord<Fields> | undefined): void {
  const index = channels.findIndex((channel) => channel.key === "castos");
  const prior = index >= 0 ? channels[index] : undefined;
  const currentValue = currentListens ? numberField(currentListens.fields, ["Value"]) : 0;
  const previousValue = previousListens ? numberField(previousListens.fields, ["Value"]) : 0;
  const metricAvailable = Boolean(currentListens);
  const channel: ChannelLike = {
    key: "castos",
    label: prior?.label ?? "Castos",
    metricLabel: "Downloads / Listens",
    color: prior?.color ?? "#6d28d9",
    activityVolume: currentCastos.length,
    metricValue: currentValue,
    previousMetricValue: previousListens ? previousValue : undefined,
    changePercent: currentListens && previousListens ? calculatePercentChange(currentValue, previousValue) : undefined,
    source: metricAvailable ? "Content_Performance + KPI_History / Castos" : "Content_Performance",
    hasData: currentCastos.length > 0 || metricAvailable,
    metricAvailable,
    metricNote: metricAvailable ? undefined : "Downloads / listens have not been imported for the selected reporting period.",
    series: currentListens ? buildMetricSeries([currentListens]) : []
  };
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

function filterSpotifyKpiRecords(records: Array<NormalizedAirtableRecord<Fields>>, metricKey: string, range: DateRangeLike): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => {
    const source = [stringField(record.fields, ["Source Name"], ""), stringField(record.fields, ["Platform"], "")].join(" ").toLowerCase();
    if (!source.includes("spotify")) return false;
    if (stringField(record.fields, ["Metric Key"], "").toLowerCase() !== metricKey.toLowerCase()) return false;
    if (!range.startDate || !range.endDate) return true;
    if (metricKey === "spotify_episode_consumption_hours") {
      const start = stringField(record.fields, ["Period Start"], "");
      const end = stringField(record.fields, ["Period End"], "");
      return start === range.startDate && end === range.endDate;
    }
    const date = dateField(record.fields, ["Date", "Snapshot Date"]);
    return Boolean(date && date >= range.startDate && date <= range.endDate);
  });
}

function filterSpotifyEpisodes(records: Array<NormalizedAirtableRecord<Fields>>, range: DateRangeLike): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => {
    if (!range.startDate || !range.endDate) return true;
    const date = dateField(record.fields, ["Publish Date", "Reporting Week", "Reporting Month", "Date", "Week", "Snapshot Date"]);
    return Boolean(date && date >= range.startDate && date <= range.endDate);
  });
}

function filterCastosPublishedEpisodes(records: Array<NormalizedAirtableRecord<Fields>>, range: DateRangeLike): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => {
    if (!isCastosPublishedEpisode(record.fields)) return false;
    if (!range.startDate || !range.endDate) return true;
    const date = dateField(record.fields, ["Publish Date", "Published At", "Date", "Created At"]);
    return Boolean(date && date >= range.startDate && date <= range.endDate);
  });
}

function isCastosPublishedEpisode(fields: Fields): boolean {
  const source = [
    stringField(fields, ["Platform"], ""),
    stringField(fields, ["Source Platform"], ""),
    stringField(fields, ["Source"], ""),
    stringField(fields, ["Source Name"], "")
  ].join(" ").toLowerCase();
  if (!source.includes("castos")) return false;
  return stringField(fields, ["Metric Type"], "").trim().toLowerCase() === "podcasts published";
}

function finiteNumber(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
