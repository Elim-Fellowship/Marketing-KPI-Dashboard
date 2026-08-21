import type { AppConfig } from "../config/env.js";
import type { NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";
import { CastosAwareCommunicationsAnalyticsService as BaseCastosAwareCommunicationsAnalyticsService } from "./castosAwareCommunicationsAnalyticsServiceBase.js";
import { calculatePercentChange } from "./kpiCalculationEngine.js";
import { numberField, stringField, type Fields } from "./communicationsIntelligenceModel.js";

interface DateRangeLike {
  startDate?: string;
  endDate?: string;
  mode?: string;
}

interface MetricAggregate {
  value: number;
  available: boolean;
  recordCount: number;
  note: string;
}

export class CastosAwareCommunicationsAnalyticsService extends BaseCastosAwareCommunicationsAnalyticsService {
  constructor(config: AppConfig, private readonly rangeAwareAirtable: AirtableService) {
    super(config, rangeAwareAirtable);
  }

  override async getOverview(query: { startDate?: string; endDate?: string; dateMode?: string } = {}): Promise<Record<string, unknown>> {
    const base = await super.getOverview(query) as Record<string, any>;
    const kpiHistory = await this.rangeAwareAirtable.getRecords("kpiHistory", { maxRecords: 1000 });
    const dateRange = (base.dateRange ?? {}) as DateRangeLike;
    const emailsSent = aggregateSourceMetricForRange(kpiHistory, "mailchimp", "emails_sent", dateRange);
    const campaignsSent = aggregateSourceMetricForRange(kpiHistory, "mailchimp", "campaigns_sent", dateRange);

    const priorSummary = (base.monthlyActivitySummary ?? {}) as Record<string, any>;
    const priorItems = (priorSummary.items ?? {}) as Record<string, any>;
    const items = {
      ...priorItems,
      emailsSent: aggregateActivityItem(emailsSent, "KPI_History / Mailchimp", "emails_sent", priorItems.emailsSent),
      emailCampaignsSent: aggregateActivityItem(campaignsSent, "KPI_History / Mailchimp", "campaigns_sent", priorItems.emailCampaignsSent)
    };
    const hasData = Object.values(items).some((item: any) => item?.available === true);

    return {
      ...base,
      monthlyActivitySummary: {
        ...priorSummary,
        hasData,
        emailsSent: items.emailsSent.available ? items.emailsSent.value : 0,
        emailCampaignsSent: items.emailCampaignsSent.available ? items.emailCampaignsSent.value : 0,
        items
      }
    };
  }

  override async getEngagement(query: { startDate?: string; endDate?: string; dateMode?: string } = {}): Promise<Record<string, unknown>> {
    const base = await super.getEngagement(query) as Record<string, any>;
    const kpiHistory = await this.rangeAwareAirtable.getRecords("kpiHistory", { maxRecords: 1000 });
    const dateRange = (base.dateRange ?? {}) as DateRangeLike;
    const previousDateRange = (base.previousDateRange ?? {}) as DateRangeLike;

    const replacements = new Map<string, { current: MetricAggregate; previous: MetricAggregate }>([
      ["website_active_users", {
        current: aggregateSourceMetricForRange(kpiHistory, "google analytics 4", "ga4_website_active_users", dateRange),
        previous: aggregateSourceMetricForRange(kpiHistory, "google analytics 4", "ga4_website_active_users", previousDateRange)
      }],
      ["email_opens", {
        current: aggregateSourceMetricForRange(kpiHistory, "mailchimp", "email_opens", dateRange),
        previous: aggregateSourceMetricForRange(kpiHistory, "mailchimp", "email_opens", previousDateRange)
      }],
      ["email_clicks", {
        current: aggregateSourceMetricForRange(kpiHistory, "mailchimp", "email_clicks", dateRange),
        previous: aggregateSourceMetricForRange(kpiHistory, "mailchimp", "email_clicks", previousDateRange)
      }],
      ["new_email_subscribers", {
        current: aggregateSourceMetricForRange(kpiHistory, "mailchimp", "new_subscribers", dateRange),
        previous: aggregateSourceMetricForRange(kpiHistory, "mailchimp", "new_subscribers", previousDateRange)
      }]
    ]);

    const engagementCards = (Array.isArray(base.engagementCards) ? base.engagementCards : []).map((card: any) => {
      const aggregate = replacements.get(String(card?.id ?? ""));
      if (!aggregate || !aggregate.current.available) return card;
      const hasComparison = aggregate.previous.available;
      return {
        ...card,
        currentValue: aggregate.current.value,
        previousValue: hasComparison ? aggregate.previous.value : undefined,
        changePercent: hasComparison ? calculatePercentChange(aggregate.current.value, aggregate.previous.value) : undefined,
        hasComparison,
        hasData: true,
        aggregationNote: aggregate.current.note
      };
    });

    return {
      ...base,
      engagementCards
    };
  }
}

function aggregateActivityItem(aggregate: MetricAggregate, source: string, metricKey: string, fallback: any): Record<string, unknown> {
  if (!aggregate.available) return fallback ?? { value: 0, available: false, source, metricKey };
  return {
    ...(fallback ?? {}),
    value: aggregate.value,
    available: true,
    source,
    metricKey,
    note: aggregate.note
  };
}

export function aggregateSourceMetricForRange(
  records: Array<NormalizedAirtableRecord<Fields>>,
  sourceTerm: string,
  metricKey: string,
  range: DateRangeLike
): MetricAggregate {
  const matching = records.filter((record) => {
    const source = [
      stringField(record.fields, ["Source Name"], ""),
      stringField(record.fields, ["Source"], ""),
      stringField(record.fields, ["Platform"], ""),
      stringField(record.fields, ["Channel"], "")
    ].join(" ").toLowerCase();
    const key = stringField(record.fields, ["Metric Key"], "").toLowerCase();
    return source.includes(sourceTerm.toLowerCase()) && key === metricKey.toLowerCase();
  });

  if (!matching.length) return unavailableMetric("No matching KPI_History records are available.");
  if (!range.startDate || !range.endDate) return aggregateRecords(matching, "Aggregated all available KPI_History records.");

  const exact = matching.filter((record) => {
    const period = recordPeriod(record);
    return period.start === range.startDate && period.end === range.endDate;
  });
  if (exact.length) {
    const preferred = preferCanonicalRecords(exact);
    return aggregateRecords(preferred, "Used the KPI_History reporting period that exactly matches the selected range.");
  }

  const contained = matching.filter((record) => {
    const period = recordPeriod(record);
    return Boolean(period.start && period.end && period.start >= range.startDate! && period.end <= range.endDate!);
  });
  if (!contained.length) {
    return unavailableMetric("No complete KPI_History reporting periods fall inside the selected range.");
  }

  const canonical = preferCanonicalRecords(contained);
  return aggregateRecords(
    canonical,
    `Aggregated ${canonical.length} non-overlapping KPI_History reporting period${canonical.length === 1 ? "" : "s"} fully contained in the selected range.`
  );
}

function preferCanonicalRecords(records: Array<NormalizedAirtableRecord<Fields>>): Array<NormalizedAirtableRecord<Fields>> {
  const deduped = new Map<string, NormalizedAirtableRecord<Fields>>();
  for (const record of records) {
    const period = recordPeriod(record);
    const key = `${period.start}|${period.end}`;
    const existing = deduped.get(key);
    if (!existing || periodPriority(record) > periodPriority(existing)) deduped.set(key, record);
  }

  const candidates = [...deduped.values()].sort((left, right) => {
    const priority = periodPriority(right) - periodPriority(left);
    if (priority !== 0) return priority;
    const leftPeriod = recordPeriod(left);
    const rightPeriod = recordPeriod(right);
    const duration = periodDurationDays(rightPeriod) - periodDurationDays(leftPeriod);
    if (duration !== 0) return duration;
    return leftPeriod.start.localeCompare(rightPeriod.start);
  });

  const selected: Array<NormalizedAirtableRecord<Fields>> = [];
  for (const candidate of candidates) {
    const candidatePeriod = recordPeriod(candidate);
    const overlaps = selected.some((record) => periodsOverlap(candidatePeriod, recordPeriod(record)));
    if (!overlaps) selected.push(candidate);
  }

  return selected.sort((left, right) => recordPeriod(left).start.localeCompare(recordPeriod(right).start));
}

function recordPeriod(record: NormalizedAirtableRecord<Fields>): { start: string; end: string } {
  const start = stringField(record.fields, ["Period Start", "Date", "Snapshot Date"], "");
  const end = stringField(record.fields, ["Period End", "Snapshot Date", "Date"], "");
  return { start, end: end || start };
}

function periodPriority(record: NormalizedAirtableRecord<Fields>): number {
  const periodType = stringField(record.fields, ["Period Type", "Granularity", "Reporting Period"], "").toLowerCase();
  if (periodType.includes("month")) return 3;
  if (periodType.includes("week")) return 2;
  if (periodType.includes("day") || periodType.includes("daily")) return 1;
  return 0;
}

function periodDurationDays(period: { start: string; end: string }): number {
  const start = Date.parse(`${period.start}T00:00:00.000Z`);
  const end = Date.parse(`${period.end}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function periodsOverlap(left: { start: string; end: string }, right: { start: string; end: string }): boolean {
  return Boolean(left.start && left.end && right.start && right.end && left.start <= right.end && right.start <= left.end);
}

function aggregateRecords(records: Array<NormalizedAirtableRecord<Fields>>, note: string): MetricAggregate {
  return {
    value: records.reduce((sum, record) => sum + numberField(record.fields, ["Value", "Metric Value", "Current Value", "Amount"]), 0),
    available: records.length > 0,
    recordCount: records.length,
    note
  };
}

function unavailableMetric(note: string): MetricAggregate {
  return { value: 0, available: false, recordCount: 0, note };
}
