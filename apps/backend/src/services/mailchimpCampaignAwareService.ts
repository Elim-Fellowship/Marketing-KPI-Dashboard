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

    return result;
  }
}
