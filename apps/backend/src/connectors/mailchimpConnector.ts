import { BaseConnector } from "./baseConnector.js";
import type { ConnectorMetadata, ConnectorRunContext, RawConnectorMetric } from "./types.js";

export class MailchimpConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "mailchimp",
    name: "Mailchimp Connector",
    sourceName: "Mailchimp",
    category: "email",
    mode: "mock",
    enabled: true,
    description: "Placeholder connector for newsletter and email campaign analytics."
  };

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const date = currentDate();

    return [
      {
        sourceRecordId: "monthly-newsletter-clicks",
        metricName: "Email Clicks",
        value: 842,
        unit: "clicks",
        date,
        targetTableKey: "contentPerformance",
        platform: "Email",
        channel: "Newsletter",
        contentTitle: "Monthly Newsletter",
        contentType: "Newsletter Edition",
        campaign: "Monthly Communications",
        activityVolume: 1
      },
      {
        sourceRecordId: "monthly-newsletter-opens",
        metricName: "Email Opens",
        value: 5310,
        unit: "opens",
        date,
        targetTableKey: "contentPerformance",
        platform: "Email",
        channel: "Newsletter",
        contentTitle: "Monthly Newsletter",
        contentType: "Newsletter Edition",
        campaign: "Monthly Communications",
        activityVolume: 1
      },
      {
        sourceRecordId: "subscriber-growth",
        metricName: "New Subscribers",
        value: 124,
        unit: "subscribers",
        date,
        targetTableKey: "kpiHistory",
        platform: "Email",
        channel: "Newsletter",
        contentType: "Audience Growth"
      }
    ];
  }
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
