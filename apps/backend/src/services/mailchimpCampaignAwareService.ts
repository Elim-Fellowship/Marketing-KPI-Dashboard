import type { AirtableClient, AirtableFields } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../logging/logger.js";
import { MailchimpService, type MailchimpSyncResult } from "./mailchimpService.js";

interface SyncOptions {
  periodType?: string;
  startDate?: string;
  endDate?: string;
}

export class MailchimpCampaignAwareService extends MailchimpService {
  constructor(
    config: AppConfig,
    private readonly campaignAirtable: AirtableClient,
    logger: Logger,
    private readonly campaignConfig: AppConfig
  ) {
    super(config, campaignAirtable, logger);
  }

  override async sync(options: SyncOptions = {}): Promise<MailchimpSyncResult> {
    const result = await super.sync(options);
    if (!result.success) return result;

    for (const period of result.dateRangeProcessed.periods) {
      const row: AirtableFields = {
        "Unique Key": ["mailchimp", "kpi", "campaigns_sent", period.periodType.toLowerCase(), period.periodStart, period.periodEnd].join(":"),
        Metric: "Campaigns Sent",
        "Metric Key": "campaigns_sent",
        KPI: "Campaigns Sent",
        Value: period.campaignsProcessed,
        Unit: "count",
        "Period Type": period.periodType,
        Date: period.periodStart,
        "Period Start": period.periodStart,
        "Period End": period.periodEnd,
        "Aggregation Method": "Count",
        Channel: "Email",
        Platform: "Mailchimp",
        "Source Name": "Mailchimp",
        "Quality Status": "Complete",
        "Snapshot Date": period.periodEnd,
        "Reporting Month": period.periodStart.slice(0, 7),
        "Source Record ID": `mailchimp:campaigns:${period.periodStart}:${period.periodEnd}`,
        "Last Synced At": new Date().toISOString()
      };

      await this.campaignAirtable.upsertByUniqueKey(
        this.campaignConfig.airtable.tables.kpiHistory,
        "Unique Key",
        String(row["Unique Key"]),
        row
      );
    }

    const campaignWrites = await this.writeCampaignPerformance(
      result.dateRangeProcessed.startDate,
      result.dateRangeProcessed.endDate
    );
    result.recordsCreated += campaignWrites.created;
    result.recordsUpdated += campaignWrites.updated;
    result.recordsProcessed += campaignWrites.created + campaignWrites.updated;

    return result;
  }

  private async writeCampaignPerformance(
    startDate?: string,
    endDate?: string
  ): Promise<{ created: number; updated: number }> {
    if (!startDate || !endDate) return { created: 0, updated: 0 };

    const campaignRange: Parameters<MailchimpService["fetchCampaigns"]>[0] = {
      periodType: "Monthly",
      periodStart: startDate,
      periodEnd: endDate,
      snapshotDate: endDate,
      reportingWeek: "",
      reportingMonth: startDate.slice(0, 7),
      weekNumber: 0
    };
    const campaigns = await this.fetchCampaigns(campaignRange);

    let created = 0;
    let updated = 0;

    for (const campaign of campaigns) {
      const report = await this.fetchCampaignReport(campaign.id);
      const publishDate = toIsoDate(report.send_time ?? campaign.send_time);
      if (!publishDate) continue;

      const emailsSent = finiteNumber(report.emails_sent ?? campaign.emails_sent);
      const opens = finiteNumber(report.opens?.unique_opens ?? report.opens?.opens_total);
      const clicks = finiteNumber(
        report.clicks?.unique_subscriber_clicks ??
        report.clicks?.unique_clicks ??
        report.clicks?.clicks_total
      );
      const openRate = percentage(opens, emailsSent);
      const clickRate = percentage(clicks, emailsSent);
      const title = String(
        report.campaign_title ??
        campaign.settings?.title ??
        campaign.settings?.subject_line ??
        "Untitled Mailchimp campaign"
      ).trim();
      const sourceRecordId = `mailchimp:campaign:${campaign.id}`;
      const row: AirtableFields = {
        Platform: "Newsletter",
        "Content Title": title,
        "Content Type": "Newsletter",
        "Publish Date": publishDate,
        "Metric Type": "Click Rate",
        "Metric Value": clickRate,
        "Source Platform": "Mailchimp",
        "Source Record ID": sourceRecordId,
        "Reporting Period": publishDate.slice(0, 7),
        "Metric Label": "Click Rate",
        "Source Name": "Mailchimp",
        "Emails Sent": emailsSent,
        Opens: opens,
        "Open Rate": openRate,
        Clicks: clicks,
        "Click Rate": clickRate
      };

      const write = await this.campaignAirtable.upsertByUniqueKey(
        this.campaignConfig.airtable.tables.contentPerformance,
        "Source Record ID",
        sourceRecordId,
        row
      );
      if (write.created) created += 1;
      else updated += 1;
    }

    return { created, updated };
  }
}

function finiteNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function toIsoDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
