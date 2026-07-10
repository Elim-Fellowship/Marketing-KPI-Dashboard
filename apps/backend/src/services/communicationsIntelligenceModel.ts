import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import {
  KPI_SCORE_DEFINITIONS,
  calculatePerformanceScores,
  combineCommunicationsPerformanceScore,
  type CommunicationsPerformanceScore,
  type KpiScore,
  type KpiScoreComponent,
  type KpiScoreDefinition,
  type ScoreInput
} from "./kpiCalculationEngine.js";

export {
  KPI_SCORE_DEFINITIONS,
  type CommunicationsPerformanceScore,
  type KpiScore,
  type KpiScoreComponent,
  type KpiScoreDefinition
} from "./kpiCalculationEngine.js";

export type Fields = Record<string, unknown>;

export type ContentGroupBy = "none" | "campaign" | "episodeDrop" | "marketingPush";

export interface MetricPoint {
  label: string;
  value: number;
  previousValue?: number;
  growthPercent?: number;
  unit?: string;
  date?: string;
  definition?: string;
}

export interface TimeSeriesPerformanceDatum {
  metric: string;
  date: string;
  value: number;
  unit?: string;
}

export interface ReportingHistoryCoverage {
  label: "Reporting History Coverage";
  value: number;
  unit: "records";
  definition: string;
  uniqueMetrics: number;
  dateRange: {
    start?: string;
    end?: string;
  };
}

export interface ContentScoreComponent {
  key: "listens" | "retention" | "engagement";
  label: string;
  rawValue: number;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
  contributionPercent: number;
  sourceFields: string[];
}

export interface ContentScoreBreakdown {
  formula: string;
  whyRanked: string;
  components: ContentScoreComponent[];
}

export interface ScoredContentItem {
  id: string;
  title: string;
  platform: string;
  type: string;
  metricLabel: string;
  metricValue: number;
  contentScore: number;
  scoreAvailable: boolean;
  rank: number;
  airtableRank?: number;
  date?: string;
  url?: string;
  campaign?: string;
  episodeDrop?: string;
  marketingPush?: string;
  scoreBreakdown: ContentScoreBreakdown;
}

export type ContentDerivedPerformanceScore = CommunicationsPerformanceScore;

export const BUSINESS_METRIC_DEFINITIONS = {
  reportingHistoryCoverage: {
    label: "Reporting History Coverage",
    definition:
      "Count and date coverage of rows in KPI_History that can be used for executive reporting."
  },
  growthRate: {
    label: "Growth Rate",
    definition:
      "Percent change over time, calculated as (current value - previous comparable value) / absolute previous value."
  },
  timeSeriesPerformanceData: {
    label: "Time-Series Performance Data",
    definition:
      "Ordered KPI_History observations used to draw historical trend lines and calculate period comparisons."
  }
} as const;

export const CONTENT_SCORE_FORMULA = {
  label: "Content Score",
  expression: "Read directly from Content_Performance ranking or score fields.",
  normalizer:
    "No backend ranking formula is applied. Airtable fields such as Rank, Content Score, Performance Score, Score, Metric Value, or Value drive ordering.",
  weights: {
    listens: 0,
    retention: 0,
    engagement: 0
  }
} as const;

export function buildKpiModel(records: Array<NormalizedAirtableRecord<Fields>>): {
  reportingHistoryCoverage: ReportingHistoryCoverage;
  metrics: MetricPoint[];
  growthRates: MetricPoint[];
  timeSeriesPerformanceData: TimeSeriesPerformanceDatum[];
  trendSeries: Record<string, MetricPoint[]>;
  communicationsPerformanceScore: CommunicationsPerformanceScore;
  scoreDefinitions: typeof KPI_SCORE_DEFINITIONS;
} {
  const grouped = groupMetricsByName(records);
  const metrics = latestMetricPoints(grouped);
  const communicationsPerformanceScore = buildCommunicationsPerformanceScore(metrics);
  const timeSeriesPerformanceData = Object.entries(grouped)
    .flatMap(([metric, points]) =>
      points.map((point) => ({
        metric,
        date: point.date ?? "",
        value: point.value,
        unit: point.unit
      }))
    )
    .filter((point) => point.date)
    .sort((left, right) => left.date.localeCompare(right.date));
  const dates = timeSeriesPerformanceData.map((point) => point.date).sort();

  return {
    reportingHistoryCoverage: {
      label: "Reporting History Coverage",
      value: records.length,
      unit: "records",
      definition: BUSINESS_METRIC_DEFINITIONS.reportingHistoryCoverage.definition,
      uniqueMetrics: Object.keys(grouped).length,
      dateRange: {
        start: dates[0],
        end: dates.at(-1)
      }
    },
    metrics,
    growthRates: metrics.filter((metric) => metric.growthPercent !== undefined),
    timeSeriesPerformanceData,
    trendSeries: Object.fromEntries(
      Object.entries(grouped).map(([name, points]) => [
        name,
        [...points]
          .sort((left, right) => dateValue(left).localeCompare(dateValue(right)))
          .slice(-24)
      ])
    ),
    communicationsPerformanceScore,
    scoreDefinitions: KPI_SCORE_DEFINITIONS
  };
}

export function buildTopContentModel(
  records: Array<NormalizedAirtableRecord<Fields>>,
  query: { timeframe?: string; platform?: string; groupBy?: string }
): {
  timeframe: string;
  platform: string;
  groupBy: ContentGroupBy;
  scoreFormula: typeof CONTENT_SCORE_FORMULA;
  communicationsPerformanceScore: ContentDerivedPerformanceScore;
  productHealthScore: ContentDerivedPerformanceScore;
  platforms: string[];
  sections: {
    podcasts: ScoredContentItem[];
    newsletters: ScoredContentItem[];
    socialPosts: ScoredContentItem[];
    videos: ScoredContentItem[];
  };
  topOverall: ScoredContentItem[];
  groups: Array<{
    groupType: ContentGroupBy;
    groupName: string;
    itemCount: number;
    averageScore: number;
    topItem?: ScoredContentItem;
    items: ScoredContentItem[];
  }>;
} {
  const timeframe = query.timeframe ?? "90d";
  const platformFilter = (query.platform ?? "all").toLowerCase();
  const groupBy = normalizeGroupBy(query.groupBy);
  const since = getSinceDate(timeframe);
  const rawItems = records.map(toRawContentItem);
  const allScoredItems = rankContentItems(rawItems);
  const items = rankContentItems(
    rawItems
      .filter((item) => !since || !item.date || new Date(item.date) >= since)
      .filter((item) => platformFilter === "all" || item.platform.toLowerCase() === platformFilter)
  );
  const communicationsPerformanceScore = buildContentDerivedPerformanceScore(allScoredItems);

  return {
    timeframe,
    platform: platformFilter,
    groupBy,
    scoreFormula: CONTENT_SCORE_FORMULA,
    communicationsPerformanceScore,
    productHealthScore: communicationsPerformanceScore,
    platforms: unique(rawItems.map((item) => item.platform)).sort(),
    sections: {
      podcasts: items.filter((item) => item.type === "podcast").slice(0, 8),
      newsletters: items.filter((item) => item.type === "newsletter").slice(0, 8),
      socialPosts: items.filter((item) => item.type === "social").slice(0, 8),
      videos: items.filter((item) => item.type === "video").slice(0, 8)
    },
    topOverall: items.slice(0, 12),
    groups: groupContentItems(items, groupBy)
  };
}

export function compareMetric(
  name: string,
  points: MetricPoint[],
  period: string
): Record<string, unknown> | undefined {
  const sorted = [...points].sort((left, right) => dateValue(right).localeCompare(dateValue(left)));
  const current = sorted[0];
  if (!current) {
    return undefined;
  }

  const previous = findPreviousPoint(current, sorted.slice(1), period);
  const growthPercent =
    previous && previous.value !== 0
      ? ((current.value - previous.value) / Math.abs(previous.value)) * 100
      : undefined;

  return {
    name,
    current,
    previous,
    growthPercent,
    definition: BUSINESS_METRIC_DEFINITIONS.growthRate.definition
  };
}

export function groupMetricsByName(
  records: Array<NormalizedAirtableRecord<Fields>>
): Record<string, MetricPoint[]> {
  const grouped: Record<string, MetricPoint[]> = {};

  for (const record of records) {
    const label = stringField(record.fields, ["KPI", "KPI Name", "Metric", "Name"], "Unknown KPI");
    const value = numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]);
    const date = dateField(record.fields, ["Date", "Reporting Date", "Period", "Month", "Week"]);
    const unit = stringField(record.fields, ["Unit", "Format"], "");

    if (!Number.isFinite(value)) {
      continue;
    }

    grouped[label] ??= [];
    grouped[label].push({ label, value, unit, date });
  }

  return grouped;
}

export function normalizePeriod(period: unknown): string {
  const value = String(period ?? "month").toLowerCase();
  if (value === "quarter" || value === "year") {
    return value;
  }

  return "month";
}

export function stringField(fields: Fields, names: string[], fallback: string): string {
  const value = findField(fields, names);
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function numberField(fields: Fields, names: string[]): number {
  const value = findField(fields, names);
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? "NaN").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dateField(fields: Fields, names: string[]): string {
  const value = findField(fields, names);
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function latestMetricPoints(grouped: Record<string, MetricPoint[]>): MetricPoint[] {
  return Object.entries(grouped).map(([label, points]) => {
    const sorted = [...points].sort((left, right) => dateValue(right).localeCompare(dateValue(left)));
    const latest = sorted[0];
    const previous = sorted[1];
    const growthPercent =
      latest && previous && previous.value !== 0
        ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
        : undefined;

    return {
      label,
      value: latest?.value ?? 0,
      previousValue: previous?.value,
      growthPercent,
      unit: latest?.unit,
      date: latest?.date,
      definition: BUSINESS_METRIC_DEFINITIONS.growthRate.definition
    };
  });
}

function buildCommunicationsPerformanceScore(metrics: MetricPoint[]): CommunicationsPerformanceScore {
  return calculatePerformanceScores({
    email: {
      openRate: scoreInput(findMetricByTerms(metrics, [
        "email open rate",
        "newsletter open rate",
        "open rate"
      ])),
      clickRate: scoreInput(findMetricByTerms(metrics, [
        "email click rate",
        "newsletter click rate",
        "click rate"
      ])),
      subscriberGrowth: scoreInput(findMetricByTerms(metrics, [
        "subscriber growth",
        "email subscriber growth",
        "newsletter subscriber growth"
      ])),
      unsubscribeRate: scoreInput(findMetricByTerms(metrics, [
        "unsubscribe rate",
        "email unsubscribe",
        "newsletter unsubscribe"
      ]))
    },
    socialMedia: {
      postsPublished: scoreInput(findMetricByTerms(metrics, [
        "posts published",
        "social posts published",
        "social posts",
        "content volume",
        "social content volume"
      ])),
      likes: scoreInput(findMetricByTerms(metrics, ["likes", "social likes"])),
      comments: scoreInput(findMetricByTerms(metrics, ["comments", "social comments"])),
      shares: scoreInput(findMetricByTerms(metrics, ["shares", "social shares"]))
    },
    podcast: {
      streams: scoreInput(findMetricByTerms(metrics, [
        "total streams",
        "podcast total streams",
        "streams"
      ])),
      podcastsPublished: scoreInput(findMetricByTerms(metrics, [
        "podcasts published",
        "episodes published",
        "podcast episodes"
      ])),
      listenerGrowth: scoreInput(findMetricByTerms(metrics, [
        "listener growth",
        "podcast listener growth",
        "audience growth"
      ]))
    },
    website: {
      visitors: scoreInput(findMetricByTerms(metrics, [
        "website visitors",
        "unique visitors",
        "website unique visitors",
        "visitors"
      ])),
      clicks: scoreInput(findMetricByTerms(metrics, [
        "website clicks",
        "website click through rate",
        "website ctr",
        "click through rate",
        "click-through rate",
        "ctr"
      ])),
      engagement: scoreInput(findMetricByTerms(metrics, [
        "website engagement",
        "engagement",
        "website engagement rate"
      ]))
    }
  });
}

function findMetricByTerms(metrics: MetricPoint[], terms: string[]): MetricPoint | undefined {
  return metrics.find((metric) => {
    const label = metric.label.toLowerCase();
    return terms.some((term) => label.includes(term.toLowerCase()));
  });
}

function metricValue(metric: MetricPoint | undefined): number {
  return roundScore(Number.isFinite(metric?.value) ? Number(metric?.value) : 0);
}

function scoreInput(metric: MetricPoint | undefined): ScoreInput {
  return {
    value: metric?.value,
    previousValue: metric?.previousValue,
    growthPercent: metric?.growthPercent,
    sourceMetric: metric?.label,
    isAvailable: metric !== undefined
  };
}

function findPreviousPoint(current: MetricPoint, points: MetricPoint[], period: string): MetricPoint | undefined {
  if (!current.date) {
    return points[0];
  }

  const currentDate = new Date(current.date);
  const target = new Date(currentDate);
  if (period === "quarter") {
    target.setMonth(target.getMonth() - 3);
  } else if (period === "year") {
    target.setFullYear(target.getFullYear() - 1);
  } else {
    target.setMonth(target.getMonth() - 1);
  }

  return points.find((point) => point.date && sameMonth(new Date(point.date), target)) ?? points[0];
}

interface RawContentItem {
  id: string;
  title: string;
  platform: string;
  type: string;
  date?: string;
  url?: string;
  campaign?: string;
  episodeDrop?: string;
  marketingPush?: string;
  airtableRank?: number;
  airtableScore?: number;
  scoreAvailable: boolean;
  metricLabel: string;
}

function toRawContentItem(record: NormalizedAirtableRecord<Fields>): RawContentItem {
  const platform = stringField(record.fields, ["Platform", "Channel"], "Unknown");
  const rawType = stringField(record.fields, ["Content Type", "Type", "Format"], platform);
  const scoreField = firstExistingField(record.fields, [
    "Content Score",
    "Performance Score",
    "Ranking Score",
    "Score",
    "Metric Value",
    "Value"
  ]);
  const rankField = firstExistingField(record.fields, ["Rank", "Ranking", "Sort Order", "Position"]);
  const metricLabel = stringField(
    record.fields,
    ["Metric Label", "Metric", "KPI", "Score Label"],
    scoreField ?? "Content Score"
  );

  return {
    id: record.id,
    title: stringField(record.fields, ["Title", "Name", "Content Title", "Episode Title"], "Untitled"),
    platform,
    type: normalizeContentType(rawType, platform),
    date: dateField(record.fields, ["Published At", "Publish Date", "Date", "Created At"]),
    url: stringField(record.fields, ["URL", "Link", "Permalink"], ""),
    campaign: stringField(record.fields, ["Campaign", "Campaign Name", "Campaign ID"], ""),
    episodeDrop: stringField(record.fields, ["Episode Drop", "Drop", "Episode Launch", "Launch"], ""),
    marketingPush: stringField(record.fields, ["Marketing Push", "Push", "Promotion", "Promo Name"], ""),
    airtableRank: rankField ? numberField(record.fields, [rankField]) : undefined,
    airtableScore: scoreField ? numberField(record.fields, [scoreField]) : undefined,
    scoreAvailable: scoreField !== undefined,
    metricLabel
  };
}

function rankContentItems(rawItems: RawContentItem[]): ScoredContentItem[] {
  return rawItems
    .map((item) => {
      const contentScore = roundScore(item.airtableScore ?? 0);

      return {
        id: item.id,
        title: item.title,
        platform: item.platform,
        type: item.type,
        metricLabel: item.metricLabel,
        metricValue: contentScore,
        contentScore,
        scoreAvailable: item.scoreAvailable,
        rank: item.airtableRank && item.airtableRank > 0 ? item.airtableRank : 0,
        airtableRank: item.airtableRank,
        date: item.date,
        url: item.url,
        campaign: item.campaign,
        episodeDrop: item.episodeDrop,
        marketingPush: item.marketingPush,
        scoreBreakdown: {
          formula: CONTENT_SCORE_FORMULA.expression,
          whyRanked: "Rank and score are read directly from Content_Performance.",
          components: []
        }
      };
    })
    .sort(compareContentItems)
    .map((item, index) => ({
      ...item,
      rank: item.airtableRank && item.airtableRank > 0 ? item.airtableRank : index + 1
    }));
}

function compareContentItems(left: ScoredContentItem, right: ScoredContentItem): number {
  const leftRank = left.airtableRank && left.airtableRank > 0 ? left.airtableRank : undefined;
  const rightRank = right.airtableRank && right.airtableRank > 0 ? right.airtableRank : undefined;

  if (leftRank !== undefined || rightRank !== undefined) {
    return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
  }

  if (left.scoreAvailable !== right.scoreAvailable) {
    return left.scoreAvailable ? -1 : 1;
  }

  return right.contentScore - left.contentScore;
}

function buildContentDerivedPerformanceScore(items: ScoredContentItem[]): ContentDerivedPerformanceScore {
  const emailScore = contentPerformanceScore("emailPerformanceScore", "Email Performance Score", "newsletter", items);
  const socialScore = contentPerformanceScore("socialMediaPerformanceScore", "Social Media Performance Score", "social", items);
  const podcastScore = contentPerformanceScore("podcastPerformanceScore", "Podcast Performance Score", "podcast", items);
  const websiteScore = contentPerformanceScore("websitePerformanceScore", "Website Performance Score", "website", items);

  return combineCommunicationsPerformanceScore([emailScore, socialScore, podcastScore, websiteScore]);
}

function contentPerformanceScore(
  key: string,
  label: string,
  type: string,
  items: ScoredContentItem[]
): KpiScore {
  const matching = items.filter((item) => item.type === type);
  const measurable = matching.filter((item) => item.scoreAvailable);
  const averageScore =
    measurable.length > 0
      ? roundScore(measurable.reduce((sum, item) => sum + item.contentScore, 0) / measurable.length)
      : 0;
  const component: KpiScoreComponent = {
    key: "contentAverage",
    label: "Content Average",
    weight: 1,
    value: averageScore,
    score: averageScore,
    sourceMetric: `${measurable.length} Content_Performance score records`
  };

  return {
    key,
    label,
    definition: `${label} derived from Airtable-provided Content_Performance scores.`,
    formula: "Average of Airtable score values for matching Content_Performance records.",
    example: "Average of matching Airtable Content_Performance scores.",
    score: averageScore,
    components: [component]
  };
}

function groupContentItems(items: ScoredContentItem[], groupBy: ContentGroupBy): Array<{
  groupType: ContentGroupBy;
  groupName: string;
  itemCount: number;
  averageScore: number;
  topItem?: ScoredContentItem;
  items: ScoredContentItem[];
}> {
  if (groupBy === "none") {
    return [];
  }

  const groups = new Map<string, ScoredContentItem[]>();
  for (const item of items) {
    const groupName = groupingValue(item, groupBy);
    groups.set(groupName, [...(groups.get(groupName) ?? []), item]);
  }

  return Array.from(groups.entries())
    .map(([groupName, groupItems]) => ({
      groupType: groupBy,
      groupName,
      itemCount: groupItems.length,
      averageScore: roundScore(
        averageAvailableScores(groupItems)
      ),
      topItem: groupItems[0],
      items: groupItems.slice(0, 5)
    }))
    .sort((left, right) => right.averageScore - left.averageScore)
    .slice(0, 10);
}

function averageAvailableScores(items: ScoredContentItem[]): number {
  const measurable = items.filter((item) => item.scoreAvailable);
  if (!measurable.length) {
    return 0;
  }

  return measurable.reduce((sum, item) => sum + item.contentScore, 0) / measurable.length;
}

function groupingValue(item: ScoredContentItem, groupBy: ContentGroupBy): string {
  if (groupBy === "campaign") {
    return item.campaign || "Unassigned campaign";
  }

  if (groupBy === "episodeDrop") {
    return item.episodeDrop || "Unassigned episode drop";
  }

  if (groupBy === "marketingPush") {
    return item.marketingPush || "Unassigned marketing push";
  }

  return "Ungrouped";
}

function normalizeContentType(type: string, platform: string): string {
  const value = `${type} ${platform}`.toLowerCase();
  if (value.includes("podcast") || value.includes("spotify")) return "podcast";
  if (value.includes("newsletter") || value.includes("email")) return "newsletter";
  if (value.includes("video") || value.includes("youtube")) return "video";
  return "social";
}

function normalizeGroupBy(groupBy: unknown): ContentGroupBy {
  const value = String(groupBy ?? "none");
  if (value === "campaign" || value === "episodeDrop" || value === "marketingPush") {
    return value;
  }

  return "none";
}

function getSinceDate(timeframe: string): Date | undefined {
  if (timeframe === "all") {
    return undefined;
  }

  const match = /^(\d+)d$/.exec(timeframe);
  if (!match) {
    return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  }

  return new Date(Date.now() - Number(match[1]) * 24 * 60 * 60 * 1000);
}

function firstExistingField(fields: Fields, names: string[]): string | undefined {
  const lowerKeys = new Map(Object.keys(fields).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const fieldName = lowerKeys.get(name.toLowerCase());
    if (fieldName) {
      return fieldName;
    }
  }

  return undefined;
}

function findField(fields: Fields, names: string[]): unknown {
  const normalized = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value])
  );

  for (const name of names) {
    const value = normalized[name.toLowerCase()];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function sameMonth(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function dateValue(point: MetricPoint): string {
  return point.date ?? "";
}

function roundScore(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}
