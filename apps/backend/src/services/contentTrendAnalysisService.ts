import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";
import type { CommunicationsAnalyticsService } from "./communicationsAnalyticsService.js";
import { dateField, numberField, stringField, type Fields } from "./communicationsIntelligenceModel.js";
import { calculatePercentChange } from "./kpiCalculationEngine.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const STABLE_THRESHOLD_PERCENT = 5;
const KPI_HISTORY_DATE_FIELDS = ["Date", "Reporting Date", "Period", "Month", "Week", "Period Start"];
const BUFFER_DATE_FIELDS = ["Metric Date", "Date", "Published At", "Publish Date"];
const BUFFER_SOCIAL_METRIC_TERMS = ["reactions", "reaction", "likes", "like"];

type TrendPeriod = "90d" | "6m" | "1y" | "all";
type HealthStatus = "improving" | "stable" | "declining" | "insufficient_history" | "no_data";

interface DateRange {
  startDate: string;
  endDate: string;
}

interface BaseChannel {
  key?: unknown;
  label?: unknown;
  metricLabel?: unknown;
  metricValue?: unknown;
  previousMetricValue?: unknown;
  changePercent?: unknown;
  hasData?: unknown;
  source?: unknown;
}

interface SignalMeasurement {
  currentValue: number;
  previousValue: number;
  hasCurrentData: boolean;
}

interface HealthSignalDefinition {
  key: string;
  label: string;
  signalLabel: string;
  aliases: string[];
  metricTerms: string[];
  excludeAliases?: string[];
  rationale: string;
  preferKpiHistory?: boolean;
}

const HEALTH_SIGNALS: HealthSignalDefinition[] = [
  {
    key: "instagram",
    label: "Instagram",
    signalLabel: "Likes",
    aliases: ["instagram", "ig"],
    metricTerms: ["likes", "like"],
    rationale: "Audience response to Instagram content."
  },
  {
    key: "facebook",
    label: "Facebook",
    signalLabel: "Likes",
    aliases: ["facebook", "fb"],
    metricTerms: ["likes", "like"],
    rationale: "Audience response to Facebook content."
  },
  {
    key: "email",
    label: "Email",
    signalLabel: "Clicks",
    aliases: ["email", "mailchimp", "newsletter"],
    excludeAliases: ["voice of elim", "elim updates"],
    metricTerms: ["clicks", "click"],
    rationale: "Recipient action after an email is delivered."
  },
  {
    key: "spotify",
    label: "Spotify",
    signalLabel: "Streams",
    aliases: ["spotify"],
    metricTerms: ["streams", "stream"],
    rationale: "Actual podcast listening activity."
  },
  {
    key: "castos",
    label: "Castos",
    signalLabel: "Podcast Listens",
    aliases: ["castos"],
    metricTerms: ["podcast listens", "castos_listens", "listens", "listen"],
    rationale: "Podcast consumption measured by Castos listens.",
    preferKpiHistory: true
  },
  {
    key: "youtube",
    label: "YouTube",
    signalLabel: "Views / Streams",
    aliases: ["youtube", "you tube"],
    metricTerms: ["views", "view", "streams", "stream"],
    rationale: "Video consumption rather than publishing volume."
  },
  {
    key: "website",
    label: "Website",
    signalLabel: "Engaged Sessions",
    aliases: ["website", "web", "site"],
    excludeAliases: ["voice of elim", "elim updates"],
    metricTerms: ["engaged sessions"],
    rationale: "Sessions in which visitors meaningfully engaged with the website.",
    preferKpiHistory: true
  },
  {
    key: "voiceOfElim",
    label: "Voice of Elim",
    signalLabel: "Article Page Views",
    aliases: ["voice of elim", "voice-of-elim"],
    metricTerms: ["article page views", "page views"],
    rationale: "Readership of published Voice of Elim articles.",
    preferKpiHistory: true
  },
  {
    key: "elimUpdates",
    label: "Elim Updates",
    signalLabel: "Article Page Views",
    aliases: ["elim updates", "elim-updates"],
    metricTerms: ["article page views", "page views"],
    rationale: "Readership of published Elim Updates articles.",
    preferKpiHistory: true
  }
];

export class ContentTrendAnalysisService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly analytics: CommunicationsAnalyticsService
  ) {}

  async getAnalysis(query: { period?: string } = {}): Promise<Record<string, unknown>> {
    const period = normalizeTrendPeriod(query.period);

    if (period === "all") {
      return {
        period,
        periodLabel: "All",
        stableThresholdPercent: STABLE_THRESHOLD_PERCENT,
        comparisonMethod: "withheld",
        message: "All-time health is withheld until a defensible long-term baseline is defined.",
        channels: HEALTH_SIGNALS.map((definition) => ({
          key: definition.key,
          label: definition.label,
          signalLabel: definition.signalLabel,
          rationale: definition.rationale,
          status: "insufficient_history" as HealthStatus,
          arrow: "—",
          currentValue: undefined,
          previousValue: undefined,
          changePercent: undefined,
          source: "Not calculated"
        }))
      };
    }

    const dateRange = rollingDateRange(period);
    const previousDateRange = previousEquivalentRange(dateRange);
    const [breakdown, kpiHistory, bufferPostMetrics] = await Promise.all([
      this.analytics.getChannelBreakdown({ ...dateRange, dateMode: "custom" }),
      this.airtable.getRecords("kpiHistory", { maxRecords: 2000 }),
      this.airtable.getRecords("bufferPostMetrics", { maxRecords: 2000 })
    ]);
    const baseChannels = Array.isArray(breakdown.channels) ? breakdown.channels as BaseChannel[] : [];

    const channels = HEALTH_SIGNALS.map((definition) => {
      const base = baseChannels.find((channel) => String(channel.key ?? "") === definition.key);
      const bufferOverride = isBufferSocialSignal(definition)
        ? measureBufferSocialSignal(bufferPostMetrics, definition, dateRange, previousDateRange)
        : undefined;
      const kpiOverride = definition.preferKpiHistory
        ? measureKpiSignal(kpiHistory, definition, dateRange, previousDateRange)
        : undefined;
      const override = bufferOverride?.hasCurrentData ? bufferOverride : kpiOverride;
      const useOverride = Boolean(override?.hasCurrentData);
      const usingBuffer = Boolean(bufferOverride?.hasCurrentData);
      const currentValue = useOverride ? override!.currentValue : numericValue(base?.metricValue);
      const previousValue = useOverride ? override!.previousValue : numericValue(base?.previousMetricValue);
      const hasData = useOverride || base?.hasData === true;
      const changePercent = hasData
        ? calculatePercentChange(currentValue, previousValue)
        : undefined;
      const status = classifyHealth(hasData, previousValue, changePercent);

      return {
        key: definition.key,
        label: definition.label,
        signalLabel: definition.signalLabel,
        intendedSignalLabel: definition.signalLabel,
        rationale: definition.rationale,
        currentValue,
        previousValue,
        changePercent,
        status,
        arrow: statusArrow(status),
        source: usingBuffer
          ? "Buffer_Post_Metrics"
          : useOverride
            ? "KPI_History"
            : String(base?.source ?? "No matching source rows"),
        usingPreferredSignal: usingBuffer || !definition.preferKpiHistory || useOverride,
        fallbackReason: definition.preferKpiHistory && !useOverride
          ? `${definition.signalLabel} was not available in KPI_History for the selected period; the existing normalized channel metric was used instead.`
          : undefined
      };
    });

    const summary = channels.reduce(
      (counts, channel) => {
        counts[channel.status] += 1;
        return counts;
      },
      { improving: 0, stable: 0, declining: 0, insufficient_history: 0, no_data: 0 } as Record<HealthStatus, number>
    );

    return {
      period,
      periodLabel: periodLabel(period),
      dateRange,
      previousDateRange,
      stableThresholdPercent: STABLE_THRESHOLD_PERCENT,
      comparisonMethod: "selected period versus immediately preceding equivalent period",
      summary,
      channels
    };
  }
}

function isBufferSocialSignal(definition: HealthSignalDefinition): boolean {
  return definition.key === "instagram" || definition.key === "facebook";
}

function measureBufferSocialSignal(
  records: Array<NormalizedAirtableRecord<Fields>>,
  definition: HealthSignalDefinition,
  currentRange: DateRange,
  previousRange: DateRange
): SignalMeasurement {
  const matching = records.filter((record) => bufferRecordMatchesSocialSignal(record.fields, definition));
  const current = filterBufferByDate(matching, currentRange);
  const previous = filterBufferByDate(matching, previousRange);
  return {
    currentValue: sumBufferValues(current),
    previousValue: sumBufferValues(previous),
    hasCurrentData: current.length > 0
  };
}

function bufferRecordMatchesSocialSignal(fields: Fields, definition: HealthSignalDefinition): boolean {
  const platformText = searchableText(fields, ["Platform", "Channel", "Source Platform"]);
  const metricText = searchableText(fields, ["Metric Name", "Metric", "Type"]);
  const sourceText = searchableText(fields, ["Source Name", "Source"]);
  const platformMatches = definition.aliases.some((alias) => platformText.includes(alias.toLowerCase()));
  const metricMatches = BUFFER_SOCIAL_METRIC_TERMS.some((term) => metricText.includes(term));
  const sourceMatches = !sourceText || sourceText.includes("buffer");
  return platformMatches && metricMatches && sourceMatches;
}

function filterBufferByDate(
  records: Array<NormalizedAirtableRecord<Fields>>,
  range: DateRange
): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => {
    const value = dateField(record.fields, BUFFER_DATE_FIELDS);
    return value >= range.startDate && value <= range.endDate;
  });
}

function sumBufferValues(records: Array<NormalizedAirtableRecord<Fields>>): number {
  return roundOne(records.reduce(
    (sum, record) => sum + numberField(record.fields, ["Metric Value", "Value", "Count"]),
    0
  ));
}

function measureKpiSignal(
  records: Array<NormalizedAirtableRecord<Fields>>,
  definition: HealthSignalDefinition,
  currentRange: DateRange,
  previousRange: DateRange
): SignalMeasurement {
  const matching = records.filter((record) => kpiRecordMatchesSignal(record.fields, definition));
  const current = filterByDate(matching, currentRange);
  const previous = filterByDate(matching, previousRange);
  return {
    currentValue: sumValues(current),
    previousValue: sumValues(previous),
    hasCurrentData: current.length > 0
  };
}

function kpiRecordMatchesSignal(fields: Fields, definition: HealthSignalDefinition): boolean {
  const channelText = searchableText(fields, ["Channel", "Platform", "Source Name", "Source"]);
  const metricText = searchableText(fields, ["KPI", "KPI Name", "Metric", "Metric Name", "Metric Key", "Name"]);
  const combined = `${channelText} ${metricText}`;
  const channelMatches = definition.aliases.some((alias) => combined.includes(alias.toLowerCase()));
  const metricMatches = definition.metricTerms.some((term) => metricText.includes(term.toLowerCase()));
  const excluded = (definition.excludeAliases ?? []).some((alias) => combined.includes(alias.toLowerCase()));
  return channelMatches && metricMatches && !excluded;
}

function filterByDate(
  records: Array<NormalizedAirtableRecord<Fields>>,
  range: DateRange
): Array<NormalizedAirtableRecord<Fields>> {
  return records.filter((record) => {
    const value = dateField(record.fields, KPI_HISTORY_DATE_FIELDS);
    return value >= range.startDate && value <= range.endDate;
  });
}

function sumValues(records: Array<NormalizedAirtableRecord<Fields>>): number {
  return roundOne(records.reduce((sum, record) => sum + numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]), 0));
}

function searchableText(fields: Fields, names: string[]): string {
  return names.map((name) => stringField(fields, [name], "")).filter(Boolean).join(" ").toLowerCase();
}

function classifyHealth(hasData: boolean, previousValue: number, changePercent?: number): HealthStatus {
  if (!hasData) return "no_data";
  if (previousValue <= 0 || changePercent === undefined || !Number.isFinite(changePercent)) return "insufficient_history";
  if (changePercent > STABLE_THRESHOLD_PERCENT) return "improving";
  if (changePercent < -STABLE_THRESHOLD_PERCENT) return "declining";
  return "stable";
}

function statusArrow(status: HealthStatus): string {
  if (status === "improving") return "↑";
  if (status === "declining") return "↓";
  if (status === "stable") return "→";
  return "—";
}

function normalizeTrendPeriod(value?: string): TrendPeriod {
  return value === "6m" || value === "1y" || value === "all" ? value : "90d";
}

function periodLabel(period: Exclude<TrendPeriod, "all">): string {
  if (period === "6m") return "6 Months";
  if (period === "1y") return "1 Year";
  return "90 Days";
}

function rollingDateRange(period: Exclude<TrendPeriod, "all">): DateRange {
  const end = startOfUtcDay(new Date());
  const start = new Date(end);
  if (period === "90d") {
    start.setUTCDate(start.getUTCDate() - 89);
  } else if (period === "6m") {
    start.setUTCMonth(start.getUTCMonth() - 6);
    start.setUTCDate(start.getUTCDate() + 1);
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function previousEquivalentRange(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const lengthDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const previousEnd = new Date(start.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (lengthDays - 1) * DAY_MS);
  return { startDate: toIsoDate(previousStart), endDate: toIsoDate(previousEnd) };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function numericValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
