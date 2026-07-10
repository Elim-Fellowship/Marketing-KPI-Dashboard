import { BaseConnector } from "./baseConnector.js";
import type { ConnectorMetadata, ConnectorRunContext, RawConnectorMetric } from "./types.js";

export class CastosConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "castos",
    name: "Castos Connector",
    sourceName: "Castos",
    category: "podcast",
    mode: "mock",
    enabled: true,
    description: "Placeholder connector for podcast hosting downloads and episode activity."
  };

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const date = currentDate();

    return [
      {
        sourceRecordId: "episode-downloads",
        metricName: "Podcast Downloads",
        value: 2860,
        unit: "downloads",
        date,
        targetTableKey: "contentPerformance",
        platform: "Castos",
        channel: "Podcast",
        contentTitle: "Weekly Podcast Episode",
        contentType: "Podcast Episode",
        campaign: "Episode Drop",
        activityVolume: 4
      },
      {
        sourceRecordId: "podcasts-published",
        metricName: "Podcasts Published",
        value: 4,
        unit: "episodes",
        date,
        targetTableKey: "kpiHistory",
        platform: "Castos",
        channel: "Podcast",
        contentType: "Publishing Output"
      }
    ];
  }
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
