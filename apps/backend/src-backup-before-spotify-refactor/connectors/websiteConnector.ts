import { BaseConnector } from "./baseConnector.js";
import type { ConnectorMetadata, ConnectorRunContext, RawConnectorMetric } from "./types.js";

export class WebsiteConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "website",
    name: "Website Analytics Connector",
    sourceName: "Website Analytics",
    category: "website",
    mode: "mock",
    enabled: true,
    description: "Placeholder connector for website visits, clicks, engagement, and article output."
  };

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const date = currentDate();

    return [
      {
        sourceRecordId: "website-visitors",
        metricName: "Website Visitors",
        value: 18420,
        unit: "visitors",
        date,
        targetTableKey: "kpiHistory",
        platform: "Website",
        channel: "Website",
        contentType: "Audience Activity"
      },
      {
        sourceRecordId: "website-clicks",
        metricName: "Website Clicks",
        value: 2175,
        unit: "clicks",
        date,
        targetTableKey: "contentPerformance",
        platform: "Website",
        channel: "Website",
        contentTitle: "Website Resource Hub",
        contentType: "Website Page",
        campaign: "Resource Promotion",
        activityVolume: 6
      },
      {
        sourceRecordId: "articles-published",
        metricName: "Website Articles Published",
        value: 6,
        unit: "articles",
        date,
        targetTableKey: "kpiHistory",
        platform: "Website",
        channel: "Website",
        contentType: "Publishing Output"
      }
    ];
  }
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
