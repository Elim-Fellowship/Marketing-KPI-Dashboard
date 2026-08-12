import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorMetadata,
  ConnectorRunContext,
  ConnectorSyncResult,
  RawConnectorMetric
} from "./types.js";
import { MailchimpCampaignAwareService } from "../services/mailchimpCampaignAwareService.js";

export class MailchimpConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "mailchimp",
    name: "Mailchimp Connector",
    sourceName: "Mailchimp",
    category: "email",
    mode: "api",
    enabled: true,
    description: "Imports production newsletter and email campaign analytics from Mailchimp."
  };

  async sync(context: ConnectorRunContext): Promise<ConnectorSyncResult> {
    const startedAtMs = Date.now();

    if (context.dryRun) {
      const finishedAt = new Date().toISOString();
      return {
        connectorId: this.metadata.id,
        sourceName: this.metadata.sourceName,
        status: "Skipped",
        startedAt: context.startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtMs,
        metricsFetched: 0,
        recordsPrepared: 0,
        writeResult: {
          attempted: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          dryRun: true
        },
        errorMessage: "Mailchimp production sync is write-through and is skipped in dry-run mode."
      };
    }

    const service = new MailchimpCampaignAwareService(
      context.config,
      context.airtable,
      context.logger,
      context.config
    );
    const result = await service.sync({ periodType: "both" });
    const finishedAt = new Date().toISOString();

    return {
      connectorId: this.metadata.id,
      sourceName: this.metadata.sourceName,
      status: result.success ? "Success" : "Failed",
      startedAt: context.startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      metricsFetched: result.campaignsProcessed,
      recordsPrepared: result.recordsProcessed,
      writeResult: {
        attempted: result.recordsProcessed,
        created: result.recordsCreated,
        updated: result.recordsUpdated,
        skipped: 0,
        dryRun: false
      },
      errorMessage: result.success ? undefined : result.message
    };
  }

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    return [];
  }
}
