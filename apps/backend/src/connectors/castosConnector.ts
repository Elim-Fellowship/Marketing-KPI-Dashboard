import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorAuthResult,
  ConnectorMetadata,
  ConnectorRunContext,
  RawConnectorMetric
} from "./types.js";

interface CastosPodcast {
  id?: string | number;
  title?: string;
  name?: string;
}

interface CastosPodcastResponse {
  data?: CastosPodcast[];
  podcasts?: CastosPodcast[];
}

const CASTOS_API_BASE_URL = "https://app.castos.com/api/v2";

export class CastosConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "castos",
    name: "Castos Connector",
    sourceName: "Castos",
    category: "podcast",
    mode: "api",
    enabled: true,
    description: "Reads podcast inventory from the Castos API; analytics ingestion is enabled only after API capability validation."
  };

  async authenticate(context: ConnectorRunContext): Promise<ConnectorAuthResult> {
    const apiKey = process.env.CASTOS_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        status: "Needs Setup",
        message: "Missing CASTOS_API_KEY"
      };
    }

    try {
      const podcasts = await this.fetchPodcasts(apiKey);
      context.logger.info("Castos authentication diagnostic", {
        podcastCount: podcasts.length,
        podcasts: podcasts.slice(0, 10).map((podcast) => ({
          id: podcast.id,
          title: podcast.title ?? podcast.name ?? "Untitled"
        }))
      });

      return {
        ok: true,
        status: "Connected",
        message: `Castos API authenticated successfully (${podcasts.length} podcast(s) accessible).`
      };
    } catch (error) {
      return {
        ok: false,
        status: "Error",
        message: `Castos API authentication failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const apiKey = process.env.CASTOS_API_KEY?.trim();
    if (!apiKey) {
      return [];
    }

    const podcasts = await this.fetchPodcasts(apiKey);
    context.logger.info("Castos podcasts loaded", {
      count: podcasts.length,
      podcasts: podcasts.slice(0, 10).map((podcast) => ({
        id: podcast.id,
        title: podcast.title ?? podcast.name ?? "Untitled"
      }))
    });

    // Intentionally return no production metrics until we confirm which
    // analytics/download endpoints are available to this Castos account.
    return [];
  }

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    return [];
  }

  private async fetchPodcasts(apiKey: string): Promise<CastosPodcast[]> {
    const response = await fetch(`${CASTOS_API_BASE_URL}/podcasts`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Castos API request failed (${response.status}): ${safeBody(body)}`);
    }

    const json = (await response.json()) as CastosPodcastResponse | CastosPodcast[];
    if (Array.isArray(json)) {
      return json;
    }

    if (Array.isArray(json.data)) {
      return json.data;
    }

    if (Array.isArray(json.podcasts)) {
      return json.podcasts;
    }

    return [];
  }
}

function safeBody(body: string): string {
  return body.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300);
}
