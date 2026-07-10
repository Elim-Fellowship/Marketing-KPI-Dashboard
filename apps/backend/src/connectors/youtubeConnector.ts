import { BaseConnector } from "./baseConnector.js";
import type { ConnectorMetadata, ConnectorRunContext, RawConnectorMetric } from "./types.js";

export class YouTubeConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "youtube",
    name: "YouTube Connector",
    sourceName: "YouTube",
    category: "video",
    mode: "mock",
    enabled: true,
    description: "Placeholder connector for YouTube views, engagement, and video output."
  };

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const date = currentDate();

    return [
      {
        sourceRecordId: "video-views",
        metricName: "Video Views",
        value: 12940,
        unit: "views",
        date,
        targetTableKey: "contentPerformance",
        platform: "YouTube",
        channel: "Video",
        contentTitle: "Monthly Teaching Video",
        contentType: "Video",
        campaign: "Video Release",
        activityVolume: 3
      },
      {
        sourceRecordId: "video-likes",
        metricName: "Video Likes",
        value: 391,
        unit: "likes",
        date,
        targetTableKey: "contentPerformance",
        platform: "YouTube",
        channel: "Video",
        contentTitle: "Monthly Teaching Video",
        contentType: "Video",
        campaign: "Video Release",
        activityVolume: 3
      }
    ];
  }
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}
