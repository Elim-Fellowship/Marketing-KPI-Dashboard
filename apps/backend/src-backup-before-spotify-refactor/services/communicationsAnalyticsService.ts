
import type { AppConfig } from "../config/env.js";
import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";
import {
  BUSINESS_METRIC_DEFINITIONS,
  KPI_SCORE_DEFINITIONS,
  buildKpiModel,
  buildTopContentModel,
  compareMetric,
  dateField,
  groupMetricsByName,
  normalizePeriod,
  numberField,
  stringField,
  type Fields
} from "./communicationsIntelligenceModel.js";
import {
  calculateGrowthIndicators,
  calculatePercentChange,
  type GrowthIndicatorInput
} from "./kpiCalculationEngine.js";

export class CommunicationsAnalyticsService {
  constructor(
    private readonly config: AppConfig,
    private readonly airtable: AirtableService
  ) {}

  async getHomepage(): Promise<Record<string, unknown>> {
    const [kpiHistory, contentPerformance, sourceStatus, spotify] = await Promise.all([
      this.airtable.getRecords("kpiHistory"),
      this.airtable.getRecords("contentPerformance"),
      this.airtable.getRecords("dataSourceStatus"),
      this.airtable.getRecords("spotifyWeeklySnapshot")
    ]);
    const kpiModel = buildKpiModel(kpiHistory);
    const contentModel = buildTopContentModel(contentPerformance, {
      timeframe: "all",
      platform: "all"
    });

    return {
      communicationsIntelligenceModel: {
        metricDefinitions: BUSINESS_METRIC_DEFINITIONS,
        scoreDefinitions: KPI_SCORE_DEFINITIONS,
        contentScoreFormula: contentModel.scoreFormula
      },
      scoreDefinitions: KPI_SCORE_DEFINITIONS,
      communicationsPerformanceScore: kpiModel.communicationsPerformanceScore,
      reportingHistoryCoverage: kpiModel.reportingHistoryCoverage,
      totalKpiHistoryRecords: kpiModel.reportingHistoryCoverage.value,
      totalKpiRecords: kpiModel.reportingHistoryCoverage.value,
      contentPerformanceSummary: {
        totalContentItems: contentPerformance.length,
        topItem: contentModel.topOverall[0] ?? null,
        byPlatform: summarizeByPlatform(contentPerformance)
      },
      productHealthScore: kpiModel.communicationsPerformanceScore,
      sourceStatusWatchlist: sourceStatus
        .map((record) => ({
          id: record.id,
          title: stringField(
            record.fields,
["Source Name", "Name", "Data Source"],
            "Unknown source"
          ),
          status: stringField(
            record.fields,
            ["Connection Status", "Status", "State"],
            "Unknown"
          ),
          severity: inferSourceSeverity(
            stringField(record.fields, ["Connection Status", "Status", "State"], "Unknown")
          ),
          date: dateField(record.fields, [
            "Last Sync Time",
            "Last Successful Sync",
            "Last Updated",
            "Updated At",
            "Last Sync",
            "Date"
          ])
        }))
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 5),
      latestSpotifySnapshot: latestRecordByDate(spotify, ["Date", "Week", "Snapshot Date"])?.fields ?? null
    };
  }

  async getOverview(query: {
    startDate?: string;
    endDate?: string;
    dateMode?: string;
  } = {}): Promise<Record<string, unknown>> {
    const [kpiHistory, status, spotify, contentPerformance, monthlyActivitySummaryRows] = await Promise.all([
      this.airtable.getRecords("kpiHistory", {
        maxRecords: 200
      }),
      this.airtable.getRecords("dataSourceStatus", {
        maxRecords: 50
      }),
      this.airtable.getRecords("spotifyWeeklySnapshot", {
        maxRecords: 60
      }),
      this.airtable.getRecords("contentPerformance", {
        maxRecords: 500
      }),
      this.airtable.getRecords("monthlyActivitySummary", {
        maxRecords: 100
      })
    ]);
    const dateRange = normalizeDateRange(query.startDate, query.endDate, query.dateMode);
    const filteredKpiHistory = filterRecordsByDate(kpiHistory, KPI_HISTORY_DATE_FIELDS, dateRange);
    const filteredSpotify = filterRecordsByDate(spotify, SPOTIFY_DATE_FIELDS, dateRange);
    const filteredContentPerformance = filterRecordsByDate(
      contentPerformance,
      CONTENT_PERFORMANCE_DATE_FIELDS,
      dateRange
    );
    const filteredMonthlyActivitySummary = filterRecordsByDate(
      monthlyActivitySummaryRows,
      MONTHLY_ACTIVITY_SUMMARY_DATE_FIELDS,
      dateRange
    );
    const kpiModel = buildKpiModel(filteredKpiHistory);
    const contentModel = buildTopContentModel(filteredContentPerformance, {
      timeframe: "all",
      platform: "all"
    });
    const overviewTrendSeries = buildOverviewTrendSeries(kpiModel.timeSeriesPerformanceData, filteredSpotify);
    const sourceStatus = status.map((record) => ({
      id: record.id,
      source: stringField(
        record.fields,
        ["Source Name", "Name", "Data Source"],
        "Unknown source"
      ),
      status: stringField(record.fields, ["Connection Status", "Status", "State"], "Unknown"),
      lastUpdated: stringField(
        record.fields,
        ["Last Sync Time", "Last Successful Sync", "Last Updated", "Updated At", "Last Sync"],
        ""
      )
    }));
    const monthlyActivitySummary = buildMonthlyActivitySummary(
      filteredMonthlyActivitySummary,
      filteredKpiHistory,
      filteredContentPerformance
    );

    return {
      communicationsIntelligenceModel: {
        metricDefinitions: BUSINESS_METRIC_DEFINITIONS,
        scoreDefinitions: KPI_SCORE_DEFINITIONS,
        contentScoreFormula: contentModel.scoreFormula
      },
      scoreDefinitions: KPI_SCORE_DEFINITIONS,
      executiveSummary: buildExecutiveSummary(
        kpiModel.metrics,
        sourceStatus,
        kpiModel.communicationsPerformanceScore.score
      ),
      dateRange,
      monthlyActivitySummary,
      reportingHistoryCoverage: kpiModel.reportingHistoryCoverage,
      metrics: kpiModel.metrics,
      growthRates: kpiModel.growthRates,
      growthIndicators: buildPriorityGrowthIndicators(kpiModel.metrics, monthlyActivitySummary),
      monthlySnapshot: buildMonthlySnapshot(filteredKpiHistory, dateRange),
      timeSeriesPerformanceData: kpiModel.timeSeriesPerformanceData,
      communicationsPerformanceScore: kpiModel.communicationsPerformanceScore,
      productHealthScore: kpiModel.communicationsPerformanceScore,
      charts: {
        spotifySeries: overviewTrendSeries,
        overviewTrendSeries,
        timeSeriesPerformanceData: kpiModel.timeSeriesPerformanceData
      },
      sourceStatus,
      rawCounts: {
        kpiHistory: filteredKpiHistory.length,
        dataSourceStatus: status.length,
        spotifyWeeklySnapshot: filteredSpotify.length,
        contentPerformance: filteredContentPerformance.length,
        monthlyActivitySummary: filteredMonthlyActivitySummary.length
      }
    };
  }

  async getTopContent(query: {
    timeframe?: string;
    platform?: string;
    groupBy?: string;
  }): Promise<Record<string, unknown>> {
    const records = await this.airtable.getRecords("contentPerformance", {
      maxRecords: 500
    });

    return buildTopContentModel(records, query);
  }

  async getComparative(query: { period?: string }): Promise<Record<string, unknown>> {
    const period = normalizePeriod(query.period);
    const records = await this.airtable.getRecords("kpiHistory", {
      maxRecords: 500
    });
    const kpiModel = buildKpiModel(records);
    const grouped = groupMetricsByName(records);
    const comparisons = Object.entries(grouped)
      .map(([name, points]) => compareMetric(name, points, period))
      .filter(Boolean);

    return {
      period,
      metricDefinitions: {
        growthRate: BUSINESS_METRIC_DEFINITIONS.growthRate,
        timeSeriesPerformanceData: BUSINESS_METRIC_DEFINITIONS.timeSeriesPerformanceData
      },
      comparisons,
      trendSeries: kpiModel.trendSeries,
      timeSeriesPerformanceData: kpiModel.timeSeriesPerformanceData
    };
  }

  async getChannelBreakdown(query: {
    startDate?: string;
    endDate?: string;
    dateMode?: string;
  } = {}): Promise<Record<string, unknown>> {
    const channelPerformance = await this.airtable.getRecords("channelPerformance", {
      maxRecords: 1000
    });
const spotifySnapshots = await this.airtable.getRecords("spotifyWeeklySnapshot", {
  maxRecords: 1000
});
    const dateRange = normalizeDateRange(query.startDate, query.endDate, query.dateMode);
    const previousDateRange = previousEquivalentDateRange(dateRange);
    const currentRows = filterRecordsByDate(
      channelPerformance,
      CHANNEL_PERFORMANCE_DATE_FIELDS,
      dateRange
    );
const currentSpotifyRows = filterRecordsByDate(
  spotifySnapshots,
  SPOTIFY_DATE_FIELDS,
  dateRange
);
    const previousRows = filterRecordsByDate(
      channelPerformance,
      CHANNEL_PERFORMANCE_DATE_FIELDS,
      previousDateRange
    );
const channels = CHANNEL_DEFINITIONS.map((definition) =>
  definition.key === "spotify"
    ? buildChannelPerformanceFromRows(
        definition,
        [...currentRows, ...currentSpotifyRows],
        previousRows
      )
    : buildChannelPerformanceFromRows(definition, currentRows, previousRows)
);
    const channelsWithData = channels.filter((channel) => channel.hasData);
    const currentTotal = channelsWithData.reduce((sum, channel) => sum + channel.metricValue, 0);
    const previousTotal = channelsWithData.reduce((sum, channel) => sum + channel.previousMetricValue, 0);

    return {
      dateRange,
      previousDateRange,
      summary: {
        label: "Communications Performance Change",
        currentValue: currentTotal,
        previousValue: previousTotal,
        changePercent: channelsWithData.length ? calculatePercentChange(currentTotal, previousTotal) : undefined,
        channelCount: channelsWithData.length
      },
      channels,
      trends: {
        channels: channels.map((channel) => ({
          key: channel.key,
          label: channel.label,
          color: channel.color,
          metricLabel: channel.metricLabel,
          series: channel.series
        }))
      }
    };
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const records = await this.airtable.getRecords("dataSourceStatus", {
      maxRecords: 100
    });

    return {
      sources: records.map((record) => ({
        id: record.id,
        source: stringField(
          record.fields,
          ["Source Name", "Name", "Data Source"],
          "Unknown source"
        ),
        status: stringField(record.fields, ["Connection Status", "Status", "State"], "Unknown"),
        lastUpdated: stringField(
          record.fields,
          ["Last Sync Time", "Last Successful Sync", "Last Updated", "Updated At", "Last Sync"],
          ""
        ),
        notes: stringField(
          record.fields,
          ["Error Message", "Sync Result", "Notes", "Message", "Details"],
          ""
        )
      }))
    };
  }
}

const KPI_HISTORY_DATE_FIELDS = ["Date", "Reporting Date", "Period", "Month", "Week"];
const CONTENT_PERFORMANCE_DATE_FIELDS = ["Published At", "Publish Date", "Date", "Created At"];
const SPOTIFY_DATE_FIELDS = ["Date", "Week", "Snapshot Date"];
const CHANNEL_PERFORMANCE_DATE_FIELDS = ["Date", "Reporting Date", "Period", "Period Start", "Month", "Week"];
const MONTHLY_ACTIVITY_SUMMARY_DATE_FIELDS = ["Date", "Reporting Date", "Period", "Month", "Period Start"];
const DAY_MS = 24 * 60 * 60 * 1000;
const CHANNEL_TEXT_FIELDS = [
  "Title",
  "Name",
  "Content Title",
  "Episode Title",
  "Platform",
  "Channel",
  "Source Name",
  "Content Type",
  "Type",
  "Format",
  "Campaign",
  "Campaign Name",
  "KPI",
  "KPI Name",
  "Metric"
];
const ACTIVITY_VOLUME_FIELDS = [
  "Activity Volume",
  "Total Activity",
  "Volume",
  "Content Volume",
  "Posts Published",
  "Items Published",
  "Quantity"
];

interface ChannelDefinition {
  key: string;
  label: string;
  metricLabel: string;
  aliases: string[];
  excludeAliases?: string[];
  metricFields: string[];
  metricTerms: string[];
  color: string;
  includeSpotifySnapshot?: boolean;
}

interface ChannelPerformanceView {
  key: string;
  label: string;
  metricLabel: string;
  color: string;
  activityVolume: number;
  metricValue: number;
  previousMetricValue: number;
  changePercent?: number;
  source: string;
  hasData: boolean;
  series: Array<{ date: string; value: number }>;
}

const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    key: "instagram",
    label: "Instagram",
    metricLabel: "Likes",
    aliases: ["instagram", "ig"],
    metricFields: ["Likes", "Total Likes"],
    metricTerms: ["likes", "like"],
    color: "#c13584"
  },
{
  key: "spotify",
  label: "Spotify",
  metricLabel: "Streams",
  aliases: ["spotify", "Spotify_CSV_Imports","Spotify"],
  metricFields: ["Streams"],
  metricTerms: ["streams", "stream"],
  color: "#1DB954"
},
  {
    key: "facebook",
    label: "Facebook",
    metricLabel: "Likes",
    aliases: ["facebook", "fb"],
    metricFields: ["Likes", "Total Likes"],
    metricTerms: ["likes", "like"],
    color: "#1877f2"
  },
  {
    key: "email",
    label: "Email",
    metricLabel: "Clicks",
    aliases: ["email"],
    excludeAliases: ["voice of elim", "elim updates"],
    metricFields: ["Clicks", "Link Clicks", "Email Clicks", "Total Clicks"],
    metricTerms: ["clicks", "click"],
    color: "#087e8b"
  },
{
  key: "spotify",
  label: "Spotify",
  metricLabel: "Streams",
  aliases: ["spotify"],
  metricFields: ["Streams", "Total Streams"],
  metricTerms: ["streams", "stream"],
  color: "#1DB954",
  includeSpotifySnapshot: true
},
 {
    key: "castos",
    label: "Castos",
    metricLabel: "Downloads",
    aliases: ["castos"],
    metricFields: ["Downloads", "Total Downloads"],
    metricTerms: ["downloads", "download"],
    color: "#6d28d9"
  },
  {
    key: "youtube",
    label: "YouTube",
    metricLabel: "Views / Streams",
    aliases: ["youtube", "you tube"],
    metricFields: ["Views", "Streams", "Plays"],
    metricTerms: ["views", "view", "streams", "stream"],
    color: "#ff0033"
  },
  {
    key: "website",
    label: "Website",
    metricLabel: "Clicks",
    aliases: ["website", "web", "site"],
    excludeAliases: ["voice of elim", "elim updates"],
    metricFields: ["Clicks", "Link Clicks", "Website Clicks", "Total Clicks"],
    metricTerms: ["clicks", "click"],
    color: "#2451b2"
  },
  {
    key: "voiceOfElim",
    label: "Voice of Elim",
    metricLabel: "Clicks",
    aliases: ["voice of elim", "voice-of-elim"],
    metricFields: ["Clicks", "Link Clicks", "Email Clicks", "Total Clicks"],
    metricTerms: ["clicks", "click"],
    color: "#b96b00"
  },
  {
    key: "elimUpdates",
    label: "Elim Updates",
    metricLabel: "Clicks",
    aliases: ["elim updates", "elim-updates"],
    metricFields: ["Clicks", "Link Clicks", "Email Clicks", "Total Clicks"],
    metricTerms: ["clicks", "click"],
    color: "#20845a"
  }
];

interface OverviewDateRange {
  startDate?: string;
  endDate?: string;
  mode?: string;
}

function normalizeDateRange(startDate?: string, endDate?: string, mode?: string): OverviewDateRange {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (!start || !end || start.getTime() > end.getTime()) {
    return { mode };
  }

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    mode
  };
}

function previousEquivalentDateRange(dateRange: OverviewDateRange): OverviewDateRange {
  const start = parseIsoDate(dateRange.startDate);
  const end = parseIsoDate(dateRange.endDate);
  if (!start || !end) {
    return { mode: "previous" };
  }

  if (dateRange.mode === "month" || dateRange.mode === "lastMonth") {
    const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const previousEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return {
      startDate: toIsoDate(previousStart),
      endDate: toIsoDate(previousEnd),
      mode: "previousMonth"
    };
  }

  if (dateRange.mode === "quarter") {
    const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1));
    const previousEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return {
      startDate: toIsoDate(previousStart),
      endDate: toIsoDate(previousEnd),
      mode: "previousQuarter"
    };
  }

  const lengthDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (lengthDays - 1) * DAY_MS);

  return {
    startDate: toIsoDate(previousStart),
    endDate: toIsoDate(previousEnd),
    mode: "previousCustom"
  };
}

function filterRecordsByDate<TFields extends Fields>(
  records: Array<NormalizedAirtableRecord<TFields>>,
  dateNames: string[],
  dateRange: OverviewDateRange
): Array<NormalizedAirtableRecord<TFields>> {
  if (!dateRange.startDate || !dateRange.endDate) {
    return records;
  }

  const start = parseIsoDate(dateRange.startDate);
  const end = parseIsoDate(dateRange.endDate);
  if (!start || !end) {
    return records;
  }

  return records.filter((record) => {
    const recordDate = parseIsoDate(dateField(record.fields, dateNames));
    return recordDate !== undefined && recordDate >= start && recordDate <= end;
  });
}

function buildChannelComparison(
  definition: ChannelDefinition,
  currentContent: Array<NormalizedAirtableRecord<Fields>>,
  previousContent: Array<NormalizedAirtableRecord<Fields>>,
  currentKpiHistory: Array<NormalizedAirtableRecord<Fields>>,
  previousKpiHistory: Array<NormalizedAirtableRecord<Fields>>,
  currentSpotify: Array<NormalizedAirtableRecord<Fields>>,
  previousSpotify: Array<NormalizedAirtableRecord<Fields>>
): Record<string, unknown> & {
  key: string;
  label: string;
  metricLabel: string;
  color: string;
  metricValue: number;
  previousMetricValue: number;
  series: Array<{ date: string; value: number }>;
} {
  const current = measureChannel(definition, currentContent, currentKpiHistory, currentSpotify);
  const previous = measureChannel(definition, previousContent, previousKpiHistory, previousSpotify);

  return {
    key: definition.key,
    label: definition.label,
    metricLabel: definition.metricLabel,
    color: definition.color,
    activityVolume: current.activityVolume,
    metricValue: current.metricValue,
    previousMetricValue: previous.metricValue,
    changePercent: calculatePercentChange(current.metricValue, previous.metricValue),
    source: current.source,
    series: current.series
  };
}

function buildChannelPerformanceFromRows(
  definition: ChannelDefinition,
  currentRows: Array<NormalizedAirtableRecord<Fields>>,
  previousRows: Array<NormalizedAirtableRecord<Fields>>
): ChannelPerformanceView {
  const current = currentRows.filter((record) => channelPerformanceRecordMatches(record.fields, definition));
  const previous = previousRows.filter((record) => channelPerformanceRecordMatches(record.fields, definition));
  const activityVolume = sumRecordMetrics(current, [
    "Activity Volume",
    "Total Activity Volume",
    "Total Activity",
    "Volume",
    "Content Volume"
  ]);
  const metricFields = [
    "Metric Value",
    "Value",
    ...definition.metricFields
  ];
  const previousMetricFields = [
    "Previous Metric Value",
    "Previous Value",
    "Previous Period Value"
  ];
  const metricValue = sumRecordMetrics(current, metricFields);
  const explicitPrevious = sumRecordMetrics(current, previousMetricFields);
  const previousMetricValue = explicitPrevious || sumRecordMetrics(previous, metricFields);
  const explicitChange = latestNumericField(current, [
    "Change Percent",
    "Growth Percent",
    "Percentage Change"
  ]);
  const metricLabel = latestStringField(current, ["Metric Label", "Metric", "KPI"]) ?? definition.metricLabel;
  const color = latestStringField(current, ["Color"]) ?? definition.color;
  const hasData = current.length > 0;

  return {
    key: definition.key,
    label: definition.label,
    metricLabel,
    color,
    activityVolume,
    metricValue,
    previousMetricValue,
    changePercent: explicitChange ?? (hasData ? calculatePercentChange(metricValue, previousMetricValue) : undefined),
    source: "Channel_Performance",
    hasData,
    series: buildChannelPerformanceSeries(definition, currentRows)
  };
}

function channelPerformanceRecordMatches(fields: Fields, definition: ChannelDefinition): boolean {
  const text = searchableFieldText(fields, [
    "Channel",
    "Platform",
    "Source Name",
    "Name",
    "Metric",
    "KPI",
    "Spotify_CSV_Imports"
  ]);
  return termsMatch(text, definition.aliases) && !termsMatch(text, definition.excludeAliases ?? []);
}

function buildChannelPerformanceSeries(
  definition: ChannelDefinition,
  rows: Array<NormalizedAirtableRecord<Fields>>
): Array<{ date: string; value: number }> {
  const points = new Map<string, number>();
  const matchingRows = rows.filter((record) => channelPerformanceRecordMatches(record.fields, definition));

  for (const record of matchingRows) {
    addSeriesPoint(
      points,
      dateField(record.fields, CHANNEL_PERFORMANCE_DATE_FIELDS),
      metricFromFields(record.fields, ["Metric Value", "Value", ...definition.metricFields])
    );
  }

  return [...points.entries()]
    .map(([date, value]) => ({ date, value: roundOne(value) }))
    .filter((point) => point.date)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function latestNumericField(records: Array<NormalizedAirtableRecord<Fields>>, fieldNames: string[]): number | undefined {
  const latest = latestRecordByDate(records, CHANNEL_PERFORMANCE_DATE_FIELDS);
  if (!latest) {
    return undefined;
  }

  for (const fieldName of fieldNames) {
    const value = metricFromFields(latest.fields, [fieldName]);
    if (Number.isFinite(value) && fieldValue(latest.fields, fieldName) !== undefined) {
      return value;
    }
  }

  return undefined;
}

function latestStringField(records: Array<NormalizedAirtableRecord<Fields>>, fieldNames: string[]): string | undefined {
  const latest = latestRecordByDate(records, CHANNEL_PERFORMANCE_DATE_FIELDS);
  if (!latest) {
    return undefined;
  }

  for (const fieldName of fieldNames) {
    const value = stringField(latest.fields, [fieldName], "");
    if (value) {
      return value;
    }
  }

  return undefined;
}

function measureChannel(
  definition: ChannelDefinition,
  contentPerformance: Array<NormalizedAirtableRecord<Fields>>,
  kpiHistory: Array<NormalizedAirtableRecord<Fields>>,
  spotify: Array<NormalizedAirtableRecord<Fields>>
): {
  activityVolume: number;
  metricValue: number;
  source: string;
  series: Array<{ date: string; value: number }>;
} {
  const contentRecords = contentPerformance.filter((record) => recordMatchesChannel(record.fields, definition));
  const kpiRecords = kpiHistory.filter((record) => kpiRecordMatchesChannel(record.fields, definition));
  const contentMetricValue = sumRecordMetrics(contentRecords, definition.metricFields);
  const kpiMetricValue = sumKpiChannelMetrics(kpiRecords, definition);
  const spotifyMetricValue = definition.includeSpotifySnapshot
    ? sumRecordMetrics(spotify, ["Streams", "Plays", "Value"])
    : 0;
  const sourceValues = [
    { source: "Spotify_Weekly_Snapshot", value: spotifyMetricValue, enabled: definition.includeSpotifySnapshot },
    { source: "Content_Performance", value: contentMetricValue, enabled: true },
    { source: "KPI_History", value: kpiMetricValue, enabled: true }
  ].filter((item) => item.enabled && item.value > 0);
  const selected = sourceValues[0] ?? { source: "No matching source rows", value: 0 };
  const activityVolume =
    sumRecordMetrics(contentRecords, ACTIVITY_VOLUME_FIELDS) || contentRecords.length || (selected.value > 0 ? 1 : 0);

  return {
    activityVolume,
    metricValue: roundOne(selected.value),
    source: selected.source,
    series: buildChannelSeries(definition, contentRecords, kpiRecords, spotify)
  };
}

function buildChannelSeries(
  definition: ChannelDefinition,
  contentRecords: Array<NormalizedAirtableRecord<Fields>>,
  kpiRecords: Array<NormalizedAirtableRecord<Fields>>,
  spotify: Array<NormalizedAirtableRecord<Fields>>
): Array<{ date: string; value: number }> {
  const points = new Map<string, number>();

  for (const record of contentRecords) {
    addSeriesPoint(points, dateField(record.fields, CONTENT_PERFORMANCE_DATE_FIELDS), metricFromFields(record.fields, definition.metricFields));
  }

  for (const record of kpiRecords) {
    addSeriesPoint(points, dateField(record.fields, KPI_HISTORY_DATE_FIELDS), numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]));
  }

  if (definition.includeSpotifySnapshot) {
    for (const record of spotify) {
      addSeriesPoint(points, dateField(record.fields, SPOTIFY_DATE_FIELDS), metricFromFields(record.fields, ["Streams", "Plays", "Value"]));
    }
  }

  return [...points.entries()]
    .map(([date, value]) => ({ date, value: roundOne(value) }))
    .filter((point) => point.date)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function addSeriesPoint(points: Map<string, number>, date: string, value: number): void {
  if (!date || !Number.isFinite(value) || value === 0) {
    return;
  }

  points.set(date, (points.get(date) ?? 0) + value);
}

function recordMatchesChannel(fields: Fields, definition: ChannelDefinition): boolean {
  const text = searchableFieldText(fields, CHANNEL_TEXT_FIELDS);
  return termsMatch(text, definition.aliases) && !termsMatch(text, definition.excludeAliases ?? []);
}

function kpiRecordMatchesChannel(fields: Fields, definition: ChannelDefinition): boolean {
  const text = searchableFieldText(fields, ["KPI", "KPI Name", "Metric", "Name"]);
  return termsMatch(text, definition.aliases) && termsMatch(text, definition.metricTerms);
}

function termsMatch(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function searchableFieldText(fields: Fields, names: string[]): string {
  return names
    .map((name) => stringField(fields, [name], ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sumRecordMetrics(records: Array<NormalizedAirtableRecord<Fields>>, fieldNames: string[]): number {
  return roundOne(records.reduce((sum, record) => sum + metricFromFields(record.fields, fieldNames), 0));
}

function sumKpiChannelMetrics(records: Array<NormalizedAirtableRecord<Fields>>, definition: ChannelDefinition): number {
  return roundOne(records.reduce((sum, record) => {
    const label = searchableFieldText(record.fields, ["KPI", "KPI Name", "Metric", "Name"]);
    if (!termsMatch(label, definition.metricTerms)) {
      return sum;
    }

    return sum + numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]);
  }, 0));
}

function metricFromFields(fields: Fields, fieldNames: string[]): number {
  for (const name of fieldNames) {
    const value = fieldValue(fields, name);
    const parsed =
      typeof value === "number"
        ? value
        : Number.parseFloat(String(value ?? "NaN").replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function fieldValue(fields: Fields, name: string): unknown {
  const directValue = fields[name];
  if (directValue !== undefined) {
    return directValue;
  }

  const target = name.toLowerCase();
  const matchingKey = Object.keys(fields).find((key) => key.toLowerCase() === target);
  return matchingKey ? fields[matchingKey] : undefined;
}

function buildMonthlyActivitySummary(
  monthlyActivityRows: Array<NormalizedAirtableRecord<Fields>>,
  kpiHistory: Array<NormalizedAirtableRecord<Fields>>,
  contentPerformance: Array<NormalizedAirtableRecord<Fields>>
): Record<string, unknown> {
  const fromMonthlyActivitySummary = summarizeMonthlyActivityRows(monthlyActivityRows);
  if (fromMonthlyActivitySummary.hasData) {
    return fromMonthlyActivitySummary;
  }

  const emailsSent = sumKpiMetrics(kpiHistory, [
    "emails sent",
    "email sends",
    "sent emails",
    "email volume"
  ]);
  const podcastsPublished = sumKpiMetrics(kpiHistory, [
    "podcasts published",
    "episodes published",
    "podcast episodes"
  ]);
  const socialPostsPublished = sumKpiMetrics(kpiHistory, [
    "social posts published",
    "social posts",
    "posts published"
  ]);
  const websiteArticlesPublished = sumKpiMetrics(kpiHistory, [
    "website articles published",
    "articles published",
    "blog posts published"
  ]);
  const newsletterEditionsPublished = sumKpiMetrics(kpiHistory, [
    "newsletter editions published",
    "newsletter editions",
    "newsletters published"
  ]);

  const summary = {
    emailsSent: emailsSent || countContentItems(contentPerformance, ["email"]),
    podcastsPublished:
      podcastsPublished || countContentItems(contentPerformance, ["podcast", "episode"]),
    socialPostsPublished:
      socialPostsPublished || countContentItems(contentPerformance, ["social", "post"]),
    websiteArticlesPublished:
      websiteArticlesPublished || countContentItems(contentPerformance, ["website", "article", "blog"]),
    newsletterEditionsPublished:
      newsletterEditionsPublished || countContentItems(contentPerformance, ["newsletter"])
  };

  const hasData = Object.values(summary).some((value) => Number(value) > 0);

  return {
    hasData,
    ...summary,
    totalPublished:
      summary.podcastsPublished +
      summary.socialPostsPublished +
      summary.websiteArticlesPublished +
      summary.newsletterEditionsPublished
  };
}

function summarizeMonthlyActivityRows(
  records: Array<NormalizedAirtableRecord<Fields>>
): Record<string, unknown> & { hasData: boolean } {
  if (!records.length) {
    return { hasData: false };
  }

  const summary = {
    emailsSent: sumRecordMetrics(records, ["Emails Sent", "Email Sends"]),
    podcastsPublished: sumRecordMetrics(records, ["Podcasts Published", "Episodes Published"]),
    socialPostsPublished: sumRecordMetrics(records, ["Social Posts Published", "Posts Published"]),
    websiteArticlesPublished: sumRecordMetrics(records, [
      "Website Articles Published",
      "Articles Published",
      "Blog Posts Published"
    ]),
    newsletterEditionsPublished: sumRecordMetrics(records, [
      "Newsletter Editions Published",
      "Newsletters Published"
    ])
  };
  const totalPublished =
    sumRecordMetrics(records, ["Total Published", "Content Published"]) ||
    summary.podcastsPublished +
      summary.socialPostsPublished +
      summary.websiteArticlesPublished +
      summary.newsletterEditionsPublished;
  const hasData = records.some((record) =>
    [
      "Emails Sent",
      "Podcasts Published",
      "Social Posts Published",
      "Website Articles Published",
      "Newsletter Editions Published",
      "Total Published"
    ].some((fieldName) => fieldValue(record.fields, fieldName) !== undefined)
  );

  return {
    hasData,
    ...summary,
    totalPublished
  };
}

function buildPriorityGrowthIndicators(
  metrics: Array<{ label: string; value: number; previousValue?: number; unit?: string }>,
  monthlyActivitySummary: Record<string, unknown>
): ReturnType<typeof calculateGrowthIndicators> {
  const contentPublishedFallback =
    monthlyActivitySummary.hasData === true
      ? {
          current: numberFromUnknown(monthlyActivitySummary.totalPublished),
          unit: "items",
          sourceMetric: "Monthly_Activity_Summary"
        }
      : undefined;

  return calculateGrowthIndicators({
    newFollowers: growthIndicatorInput(metrics, [
      "new followers",
      "follower growth",
      "audience growth",
      "social audience growth"
    ]),
    newSubscribers: growthIndicatorInput(metrics, [
      "new subscribers",
      "subscriber growth",
      "newsletter subscriber growth",
      "email subscriber growth"
    ]),
    newPodcastListeners: growthIndicatorInput(metrics, [
      "new podcast listeners",
      "podcast listener growth",
      "listener growth",
      "listeners"
    ]),
    websiteVisitors: growthIndicatorInput(metrics, [
      "website visitors",
      "unique visitors",
      "visitors",
      "website traffic"
    ]),
    contentPublished: growthIndicatorInput(metrics, [
      "content published",
      "content volume",
      "posts published",
      "podcasts published",
      "articles published"
    ], contentPublishedFallback)
  }).filter((indicator) =>
    Boolean(indicator.sourceMetric) ||
    indicator.value !== 0 ||
    indicator.previousValue !== undefined
  );
}

function growthIndicatorInput(
  metrics: Array<{ label: string; value: number; previousValue?: number; unit?: string }>,
  terms: string[],
  fallback: GrowthIndicatorInput = {}
): GrowthIndicatorInput {
  const metric = metrics.find((candidate) => {
    const label = candidate.label.toLowerCase();
    return terms.some((term) => label.includes(term.toLowerCase()));
  });

  return {
    current: metric?.value ?? fallback.current,
    previous: metric?.previousValue ?? fallback.previous,
    unit: metric?.unit ?? fallback.unit,
    sourceMetric: metric?.label ?? fallback.sourceMetric
  };
}

function numberFromUnknown(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function buildMonthlySnapshot(
  kpiHistory: Array<NormalizedAirtableRecord<Fields>>,
  dateRange: OverviewDateRange
): Array<{ kpi: string; unit?: string; weeks: Array<number | undefined> }> {
  const grouped = new Map<string, { unit?: string; weeks: number[][] }>();
  const start = parseIsoDate(dateRange.startDate);

  for (const record of kpiHistory) {
    const kpi = stringField(record.fields, ["KPI", "KPI Name", "Metric", "Name"], "Unknown KPI");
    const value = numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]);
    const date = parseIsoDate(dateField(record.fields, KPI_HISTORY_DATE_FIELDS));
    const weekIndex = date ? weekIndexForDate(date, start) : 0;

    if (weekIndex < 0 || weekIndex > 3 || !Number.isFinite(value)) {
      continue;
    }

    const existing = grouped.get(kpi) ?? {
      unit: stringField(record.fields, ["Unit", "Format"], ""),
      weeks: [[], [], [], []]
    };
    existing.weeks[weekIndex].push(value);
    grouped.set(kpi, existing);
  }

  return [...grouped.entries()]
    .map(([kpi, value]) => ({
      kpi,
      unit: value.unit,
      weeks: value.weeks.map((weekValues) =>
        weekValues.length
          ? roundOne(weekValues.reduce((sum, current) => sum + current, 0) / weekValues.length)
          : undefined
      )
    }))
    .sort((left, right) => left.kpi.localeCompare(right.kpi));
}

function sumKpiMetrics(
  records: Array<NormalizedAirtableRecord<Fields>>,
  terms: string[]
): number {
  return records.reduce((sum, record) => {
    const label = stringField(record.fields, ["KPI", "KPI Name", "Metric", "Name"], "").toLowerCase();
    if (!terms.some((term) => label.includes(term))) {
      return sum;
    }

    return sum + numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]);
  }, 0);
}

function countContentItems(
  records: Array<NormalizedAirtableRecord<Fields>>,
  terms: string[]
): number {
  return records.filter((record) => {
    const contentType = stringField(record.fields, ["Content Type", "Type", "Format"], "");
    const platform = stringField(record.fields, ["Platform", "Channel", "Source Name"], "");
    const searchable = `${contentType} ${platform}`.toLowerCase();
    return terms.some((term) => searchable.includes(term));
  }).length;
}

function weekIndexForDate(date: Date, rangeStart?: Date): number {
  if (rangeStart) {
    return Math.min(Math.max(Math.floor((date.getTime() - rangeStart.getTime()) / (7 * DAY_MS)), 0), 3);
  }

  return Math.min(Math.max(Math.ceil(date.getUTCDate() / 7) - 1, 0), 3);
}

function parseIsoDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildOverviewTrendSeries(
  kpiHistorySeries: Array<{ metric: string; date: string; value: number; unit?: string }>,
  spotify: Array<NormalizedAirtableRecord<Fields>>
): Array<{ date: string; value: number }> {
  const scoreSeries = kpiHistorySeries.filter((point) =>
    point.metric.toLowerCase().includes("communications performance score")
  );
  const selectedKpiSeries = scoreSeries.length ? scoreSeries : kpiHistorySeries;
  const points = new Map<string, number>();

  for (const point of selectedKpiSeries) {
    if (point.date && Number.isFinite(point.value)) {
      points.set(point.date, (points.get(point.date) ?? 0) + point.value);
    }
  }

  if (points.size > 0) {
    return [...points.entries()]
      .map(([date, value]) => ({ date, value: roundOne(value) }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  return toTimeSeries(spotify, SPOTIFY_DATE_FIELDS, [
    "Streams",
    "Downloads",
    "Listeners",
    "Plays",
    "Value"
  ]);
}

function toTimeSeries(
  records: Array<NormalizedAirtableRecord<Fields>>,
  dateNames: string[],
  valueNames: string[]
): Array<{ date: string; value: number }> {
  return records
    .map((record) => ({
      date: dateField(record.fields, dateNames),
      value: numberField(record.fields, valueNames)
    }))
    .filter((point) => point.date && Number.isFinite(point.value))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildExecutiveSummary(
  metrics: Array<{ growthPercent?: number }>,
  status: Array<Record<string, unknown>>,
  communicationsPerformanceScore: number
): string {
  const improving = metrics.filter((metric) => (metric.growthPercent ?? 0) > 0).length;
  const total = metrics.length;
  const staleSources = status.filter((source) =>
    String(source.status ?? "").toLowerCase().includes("stale")
  ).length;

  if (total === 0) {
    return "No data available. Add Airtable KPI_History rows to populate the overview.";
  }

  return `${improving} of ${total} tracked communications KPIs have a positive growth rate. Communications Performance Score is ${communicationsPerformanceScore.toFixed(1)}. ${staleSources} data sources may need attention.`;
}

function inferSourceSeverity(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("down")) {
    return "High";
  }

  if (value.includes("stale") || value.includes("warning") || value.includes("delayed")) {
    return "Medium";
  }

  return "Normal";
}

function summarizeByPlatform(records: Array<NormalizedAirtableRecord<Fields>>): Record<string, number> {
  return records.reduce<Record<string, number>>((summary, record) => {
    const platform = stringField(record.fields, ["Platform", "Channel", "Source Name"], "Unknown");
    summary[platform] = (summary[platform] ?? 0) + 1;
    return summary;
  }, {});
}

function latestRecordByDate(
  records: Array<NormalizedAirtableRecord<Fields>>,
  dateNames: string[]
): NormalizedAirtableRecord<Fields> | undefined {
  return [...records].sort((left, right) =>
    dateField(right.fields, dateNames).localeCompare(dateField(left.fields, dateNames))
  )[0];
}
