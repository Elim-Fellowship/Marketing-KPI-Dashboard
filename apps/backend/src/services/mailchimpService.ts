import type { AirtableClient, AirtableFields } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import { isAppError } from "../errors.js";
import type { Logger } from "../logging/logger.js";
import { serializeError } from "../logging/logger.js";

type PeriodType = "Weekly" | "Monthly";

interface ReportingPeriod {
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  snapshotDate: string;
  reportingWeek: string;
  reportingMonth: string;
  weekNumber: number;
}

interface MailchimpCampaign {
  id: string;
  status?: string;
  send_time?: string;
  emails_sent?: number;
  recipients?: {
    list_id?: string;
  };
  settings?: {
    title?: string;
    subject_line?: string;
  };
}

interface MailchimpCampaignsResponse {
  campaigns?: MailchimpCampaign[];
  total_items?: number;
}

interface MailchimpReport {
  id: string;
  emails_sent?: number;
  campaign_title?: string;
  send_time?: string;
  opens?: {
    opens_total?: number;
    unique_opens?: number;
    open_rate?: number;
  };
  clicks?: {
    clicks_total?: number;
    unique_clicks?: number;
    unique_subscriber_clicks?: number;
    click_rate?: number;
  };
  unsubscribed?: number;
}

interface MailchimpListInfo {
  stats?: {
    member_count?: number;
    unsubscribe_count?: number;
  };
}

interface MailchimpListActivityResponse {
  activity?: MailchimpListActivity[];
}

interface MailchimpListActivity {
  day?: string;
  emails_sent?: number;
  unique_opens?: number;
  recipient_clicks?: number;
  subs?: number;
  unsubs?: number;
}

interface MailchimpPeriodMetrics {
  period: ReportingPeriod;
  campaignsProcessed: number;
  emailsSent: number;
  uniqueOpens: number;
  uniqueClicks: number;
  newSubscribers: number;
  totalSubscribers: number;
  unsubscribes: number;
  subscriberGrowthDelta: number;
  subscriberGrowthPercent: number;
  openRate: number;
  clickRate: number;
  unsubscribeRate: number;
  qualityStatus: "Complete" | "Estimated" | "Partial";
}

export interface MailchimpSyncResult {
  success: boolean;
  status: "Success" | "Failed";
  message: string;
  startedAt: string;
  finishedAt: string;
  campaignsProcessed: number;
  dateRangeProcessed: {
    startDate?: string;
    endDate?: string;
    periods: Array<{
      periodType: PeriodType;
      periodStart: string;
      periodEnd: string;
      campaignsProcessed: number;
    }>;
  };
  recordsCreated: number;
  recordsUpdated: number;
  recordsProcessed: number;
  missingFields: string[];
  errors: Array<{ code: string; message: string }>;
}

export interface MailchimpIntegrationStatus {
  configured: boolean;
  lastSyncTime?: string;
  lastResult?: "Success" | "Failed";
  lastMessage?: string;
  lastCampaignsProcessed?: number;
  lastRecordsProcessed?: number;
  missingFields?: string[];
}

interface SyncOptions {
  periodType?: string;
}

const KPI_HISTORY_REQUIRED_FIELDS = [
  "Unique Key",
  "Metric",
  "Metric Key",
  "KPI",
  "Value",
  "Unit",
  "Period Type",
  "Date",
  "Period Start",
  "Period End",
  "Aggregation Method",
  "Channel",
  "Platform",
  "Source Name",
  "Quality Status",
  "Snapshot Date",
  "Reporting Week",
  "Reporting Month",
  "Week Number",
  "Numerator",
  "Denominator",
  "Previous Value",
  "Change Percent",
  "Source Record ID",
  "Last Synced At"
] as const;

export class MailchimpService {
  private lastStatus: MailchimpIntegrationStatus;

  constructor(
    private readonly config: AppConfig,
    private readonly airtable: AirtableClient,
    private readonly logger: Logger
  ) {
    this.lastStatus = {
      configured: config.mailchimp.configured
    };
  }

  getStatus(): MailchimpIntegrationStatus {
    return {
      ...this.lastStatus,
      configured: this.config.mailchimp.configured
    };
  }

  async sync(options: SyncOptions = {}): Promise<MailchimpSyncResult> {
    const startedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      const periods = buildReportingPeriods(options.periodType);
      const dateRange = {
        startDate: periods.map((period) => period.periodStart).sort()[0],
        endDate: periods.map((period) => period.periodEnd).sort().at(-1)
      };
      const missingFields = await this.findMissingKpiHistoryFields();

      if (missingFields.length > 0) {
        return this.recordFailure(startedAt, "KPI_History is missing required Mailchimp fields.", missingFields);
      }

      const [listInfo, activity] = await Promise.all([
        this.fetchAudienceInfo(),
        this.fetchAudienceActivity()
      ]);
      const periodMetrics: MailchimpPeriodMetrics[] = [];

      for (const period of periods) {
        const campaigns = await this.fetchCampaigns(period);
        const reports = await Promise.all(campaigns.map((campaign) => this.fetchCampaignReport(campaign.id)));
        periodMetrics.push(this.buildPeriodMetrics(period, campaigns, reports, activity, listInfo));
      }

      const writeResults = await this.writeKpiHistory(periodMetrics);
      const campaignsProcessed = periodMetrics.reduce((sum, metrics) => sum + metrics.campaignsProcessed, 0);
      const finishedAt = new Date().toISOString();
      const result: MailchimpSyncResult = {
        success: true,
        status: "Success",
        message: "Mailchimp sync completed.",
        startedAt,
        finishedAt,
        campaignsProcessed,
        dateRangeProcessed: {
          ...dateRange,
          periods: periodMetrics.map((metrics) => ({
            periodType: metrics.period.periodType,
            periodStart: metrics.period.periodStart,
            periodEnd: metrics.period.periodEnd,
            campaignsProcessed: metrics.campaignsProcessed
          }))
        },
        recordsCreated: writeResults.created,
        recordsUpdated: writeResults.updated,
        recordsProcessed: writeResults.created + writeResults.updated,
        missingFields: [],
        errors: []
      };

      this.lastStatus = {
        configured: true,
        lastSyncTime: finishedAt,
        lastResult: "Success",
        lastMessage: result.message,
        lastCampaignsProcessed: campaignsProcessed,
        lastRecordsProcessed: result.recordsProcessed,
        missingFields: []
      };

      return result;
    } catch (error) {
      this.logger.error("Mailchimp sync failed", {
        error: serializeError(error)
      });

      return this.recordFailure(
        startedAt,
        error instanceof Error ? error.message : String(error),
        []
      );
    }
  }

  async fetchCampaigns(period: ReportingPeriod): Promise<MailchimpCampaign[]> {
    const campaigns: MailchimpCampaign[] = [];
    let offset = 0;
    const count = 1000;

    while (true) {
      const response = await this.request<MailchimpCampaignsResponse>("/campaigns", {
        status: "sent",
        type: "regular",
        list_id: this.config.mailchimp.audienceId!,
        since_send_time: `${period.periodStart}T00:00:00+00:00`,
        before_send_time: `${addOneDay(period.periodEnd)}T00:00:00+00:00`,
        count: String(count),
        offset: String(offset)
      });
      const page = response.campaigns ?? [];
      campaigns.push(...page);

      if (page.length < count) {
        break;
      }

      offset += count;
    }

    return campaigns.filter((campaign) => {
      const sendDate = toIsoDate(campaign.send_time);
      return campaign.status === "sent" && sendDate >= period.periodStart && sendDate <= period.periodEnd;
    });
  }

  async fetchCampaignReport(campaignId: string): Promise<MailchimpReport> {
    return this.request<MailchimpReport>(`/reports/${encodeURIComponent(campaignId)}`);
  }

  async fetchAudienceInfo(): Promise<MailchimpListInfo> {
    return this.request<MailchimpListInfo>(`/lists/${encodeURIComponent(this.config.mailchimp.audienceId!)}`);
  }

  async fetchAudienceActivity(): Promise<MailchimpListActivity[]> {
    const response = await this.request<MailchimpListActivityResponse>(
      `/lists/${encodeURIComponent(this.config.mailchimp.audienceId!)}/activity`,
      {
        count: "180"
      }
    );

    return response.activity ?? [];
  }

  private buildPeriodMetrics(
    period: ReportingPeriod,
    campaigns: MailchimpCampaign[],
    reports: MailchimpReport[],
    activity: MailchimpListActivity[],
    listInfo: MailchimpListInfo
  ): MailchimpPeriodMetrics {
    const matchingActivity = activity.filter((entry) => {
      const date = toIsoDate(entry.day);
      return date >= period.periodStart && date <= period.periodEnd;
    });
    const reportEmailsSent = reports.reduce((sum, report) => sum + numberValue(report.emails_sent), 0);
    const campaignEmailsSent = campaigns.reduce((sum, campaign) => sum + numberValue(campaign.emails_sent), 0);
    const emailsSent = reportEmailsSent || campaignEmailsSent;
    const uniqueOpens = reports.reduce(
      (sum, report) => sum + numberValue(report.opens?.unique_opens ?? report.opens?.opens_total),
      0
    );
    const uniqueClicks = reports.reduce(
      (sum, report) =>
        sum + numberValue(report.clicks?.unique_subscriber_clicks ?? report.clicks?.unique_clicks ?? report.clicks?.clicks_total),
      0
    );
    const campaignUnsubscribes = reports.reduce((sum, report) => sum + numberValue(report.unsubscribed), 0);
    const activityNewSubscribers = matchingActivity.reduce((sum, entry) => sum + numberValue(entry.subs), 0);
    const activityUnsubscribes = matchingActivity.reduce((sum, entry) => sum + numberValue(entry.unsubs), 0);
    const totalSubscribers = numberValue(listInfo.stats?.member_count);
    const unsubscribes = activityUnsubscribes || campaignUnsubscribes;
    const subscriberGrowthDelta = activityNewSubscribers - unsubscribes;
    const previousSubscribers = totalSubscribers - subscriberGrowthDelta;
    const subscriberGrowthPercent =
      previousSubscribers > 0 ? (subscriberGrowthDelta / Math.abs(previousSubscribers)) * 100 : 0;
    const qualityStatus = matchingActivity.length > 0 ? "Complete" : "Partial";

    return {
      period,
      campaignsProcessed: campaigns.length,
      emailsSent,
      uniqueOpens,
      uniqueClicks,
      newSubscribers: activityNewSubscribers,
      totalSubscribers,
      unsubscribes,
      subscriberGrowthDelta,
      subscriberGrowthPercent: roundOne(subscriberGrowthPercent),
      openRate: percent(uniqueOpens, emailsSent),
      clickRate: percent(uniqueClicks, emailsSent),
      unsubscribeRate: percent(unsubscribes, emailsSent),
      qualityStatus
    };
  }

  private async writeKpiHistory(periodMetrics: MailchimpPeriodMetrics[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const metrics of periodMetrics) {
      for (const row of toKpiHistoryRows(metrics)) {
        const result = await this.airtable.upsertByUniqueKey(
          this.config.airtable.tables.kpiHistory,
          "Unique Key",
          String(row["Unique Key"]),
          row
        );

        if (result.created) {
          created += 1;
        } else {
          updated += 1;
        }
      }
    }

    return { created, updated };
  }

  private async findMissingKpiHistoryFields(): Promise<string[]> {
    const missing: string[] = [];

    for (const field of KPI_HISTORY_REQUIRED_FIELDS) {
      try {
        await this.airtable.verifyTableFields(this.config.airtable.tables.kpiHistory, [field]);
      } catch (error) {
        if (isAppError(error) && error.code === "MISSING_AIRTABLE_FIELD") {
          missing.push(field);
          continue;
        }

        throw error;
      }
    }

    return missing;
  }

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const search = new URLSearchParams(params);
    const baseUrl =
      this.config.mailchimp.apiBaseUrl ??
      `https://${this.config.mailchimp.serverPrefix}.api.mailchimp.com/3.0`;
    const queryString = search.toString();
    const url = `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${this.config.mailchimp.apiKey}`).toString("base64")}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mailchimp API request failed (${response.status}): ${safeBody(body)}`);
    }

    return (await response.json()) as T;
  }

  private assertConfigured(): void {
    if (!this.config.mailchimp.configured) {
      throw new Error(
        "Mailchimp is not configured. Set MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, and MAILCHIMP_AUDIENCE_ID."
      );
    }
  }

  private recordFailure(
    startedAt: string,
    message: string,
    missingFields: string[]
  ): MailchimpSyncResult {
    const finishedAt = new Date().toISOString();
    const result: MailchimpSyncResult = {
      success: false,
      status: "Failed",
      message,
      startedAt,
      finishedAt,
      campaignsProcessed: 0,
      dateRangeProcessed: {
        periods: []
      },
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsProcessed: 0,
      missingFields,
      errors: [{ code: missingFields.length ? "MISSING_AIRTABLE_FIELD" : "MAILCHIMP_SYNC_FAILED", message }]
    };

    this.lastStatus = {
      configured: this.config.mailchimp.configured,
      lastSyncTime: finishedAt,
      lastResult: "Failed",
      lastMessage: message,
      lastCampaignsProcessed: 0,
      lastRecordsProcessed: 0,
      missingFields
    };

    return result;
  }
}

function toKpiHistoryRows(metrics: MailchimpPeriodMetrics): AirtableFields[] {
  const period = metrics.period;
  const common = {
    "Period Type": period.periodType,
    Date: period.periodStart,
    "Period Start": period.periodStart,
    "Period End": period.periodEnd,
    "Snapshot Date": period.snapshotDate,
    "Reporting Week": period.reportingWeek,
    "Reporting Month": period.reportingMonth,
    "Week Number": period.weekNumber,
    Channel: "Email",
    Platform: "Mailchimp",
    "Source Name": "Mailchimp",
    "Quality Status": metrics.qualityStatus,
    "Source Record ID": `mailchimp:${period.periodType.toLowerCase()}:${period.periodStart}:${period.periodEnd}`,
    "Last Synced At": new Date().toISOString()
  };

  return [
    kpiRow(common, "emails_sent", "Emails Sent", metrics.emailsSent, "count", "Sum"),
    kpiRow(common, "email_open_rate", "Email Open Rate", metrics.openRate, "percent", "Weighted Average", {
      Numerator: metrics.uniqueOpens,
      Denominator: metrics.emailsSent
    }),
    kpiRow(common, "email_click_rate", "Email Click Rate", metrics.clickRate, "percent", "Weighted Average", {
      Numerator: metrics.uniqueClicks,
      Denominator: metrics.emailsSent
    }),
    kpiRow(common, "new_subscribers", "New Subscribers", metrics.newSubscribers, "count", "Sum"),
    kpiRow(common, "total_subscribers", "Total Subscribers", metrics.totalSubscribers, "count", "Latest"),
    kpiRow(common, "unsubscribes", "Unsubscribes", metrics.unsubscribes, "count", "Sum"),
    kpiRow(common, "subscriber_growth", "Subscriber Growth", metrics.subscriberGrowthPercent, "percent", "Calculated", {
      Numerator: metrics.subscriberGrowthDelta,
      Denominator: metrics.totalSubscribers - metrics.subscriberGrowthDelta,
      "Change Percent": metrics.subscriberGrowthPercent
    }),
    kpiRow(common, "unsubscribe_rate", "Unsubscribe Rate", metrics.unsubscribeRate, "percent", "Weighted Average", {
      Numerator: metrics.unsubscribes,
      Denominator: metrics.emailsSent
    })
  ];
}

function kpiRow(
  common: Record<string, string | number>,
  metricKey: string,
  metric: string,
  value: number,
  unit: string,
  aggregationMethod: string,
  extra: AirtableFields = {}
): AirtableFields {
  const uniqueKey = [
    "mailchimp",
    "kpi",
    metricKey,
    String(common["Period Type"]).toLowerCase(),
    common["Snapshot Date"],
    `week-${common["Week Number"]}`,
    common["Period Start"],
    common["Period End"]
  ].join(":");

  return {
    "Unique Key": uniqueKey,
    Metric: metric,
    "Metric Key": metricKey,
    KPI: metric,
    Value: roundOne(value),
    Unit: unit,
    "Aggregation Method": aggregationMethod,
    ...common,
    ...extra
  };
}

function buildReportingPeriods(periodType?: string): ReportingPeriod[] {
  const normalized = String(periodType ?? "both").toLowerCase();
  const periods: ReportingPeriod[] = [];

  if (normalized === "both" || normalized === "weekly" || normalized === "week") {
    periods.push(previousCompleteWeek());
  }

  if (normalized === "both" || normalized === "monthly" || normalized === "month") {
    periods.push(previousCompleteMonth());
  }

  return periods.length ? periods : [previousCompleteWeek(), previousCompleteMonth()];
}

function previousCompleteWeek(): ReportingPeriod {
  const today = startOfUtcDay(new Date());
  const day = today.getUTCDay() || 7;
  const currentWeekStart = new Date(today.getTime() - (day - 1) * DAY_MS);
  const periodStart = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  const periodEnd = new Date(currentWeekStart.getTime() - DAY_MS);

  return reportingPeriod("Weekly", periodStart, periodEnd);
}

function previousCompleteMonth(): ReportingPeriod {
  const today = new Date();
  const periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));

  return reportingPeriod("Monthly", periodStart, periodEnd);
}

function reportingPeriod(periodType: PeriodType, periodStart: Date, periodEnd: Date): ReportingPeriod {
  return {
    periodType,
    periodStart: formatDate(periodStart),
    periodEnd: formatDate(periodEnd),
    snapshotDate: formatDate(periodEnd),
    reportingWeek: isoWeekLabel(periodStart),
    reportingMonth: formatMonth(periodStart),
    weekNumber: isoWeekNumber(periodStart)
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addOneDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return formatDate(new Date(date.getTime() + DAY_MS));
}

function toIsoDate(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : formatDate(date);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isoWeekLabel(date: Date): string {
  return `${isoWeekYear(date)}-W${String(isoWeekNumber(date)).padStart(2, "0")}`;
}

function isoWeekYear(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  return target.getUTCFullYear();
}

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

function percent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return roundOne((numerator / denominator) * 100);
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundOne(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function safeBody(body: string): string {
  return body.replace(/[A-Za-z0-9_-]{20,}-[a-z]{2}\d/gi, "[redacted]").slice(0, 500);
}
