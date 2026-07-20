import { BaseConnector } from "./baseConnector.js";
import { RawConnectorMetric } from "./types.js";
import type {
  ConnectorRunContext,
  ConnectorSyncResult
} from "./types.js";

export class SpotifyConnector extends BaseConnector {
  readonly metadata = {
    id: "spotify" as const,
    name: "Spotify CSV Import",
    sourceName: "Spotify",
    description: "Imports Spotify podcast performance metrics from CSV files",
    category: "podcast" as const,
    mode: "manual" as const,
    enabled: true
  };

  async getMockMetrics(
    context: ConnectorRunContext
  ): Promise<RawConnectorMetric[]> {
    return [
      {
        sourceRecordId: "spotify-test",
        metricName: "streams",
        value: 1000,
        unit: "streams",
        date: new Date().toISOString(),
        targetTableKey: "spotifyWeeklySnapshot"
      }
    ];
  }

  async sync(
    context: ConnectorRunContext
  ): Promise<ConnectorSyncResult> {

    const csv = context.csv ?? "";

    const lines = csv
      .split("\n")
      .filter(Boolean);

    const rows = lines.map((line: string) => {
      const [
        episodeName,
        totalStreams,
        publishDate
      ] = line.split(",");

      return {
        Date: publishDate?.trim(),
        Streams: Number(totalStreams),
        "Top Episode": episodeName?.trim(),
        Spotify_CSV_Imports: "spotify"
      };
    });

    return {
      sourceName: "Spotify",
      connectorId: "spotify",
      status: "Success",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      metricsFetched: rows.length,
      recordsPrepared: rows.length,
      writeResult: {
        attempted: rows.length,
        created: rows.length,
        updated: 0,
        skipped: 0,
        dryRun: false
      }
    };
  }
}