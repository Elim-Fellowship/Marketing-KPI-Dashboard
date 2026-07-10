import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorRunContext,
  ConnectorSyncResult
} from "./types.js";

export class SpotifyConnector extends BaseConnector {
  readonly metadata = {
    id: "spotify",
    name: "Spotify CSV Import",
    sourceName: "Spotify",
    category: "streaming",
    mode: "manual",
    enabled: true
  };

  async sync(context: ConnectorRunContext): Promise<ConnectorSyncResult> {
    const csv = (context as any).csv;

    if (!csv) {
      throw new Error("Missing CSV data for Spotify import");
    }

    const lines = csv.split("\n").filter(Boolean);

const rows = lines.map((line) => {
  const [episodeName, totalStreams, publishDate] = line.split(",");

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
      recordsProcessed: lines.length,
      message: "Spotify CSV imported successfully",
      data: rows
    };
  }
}
