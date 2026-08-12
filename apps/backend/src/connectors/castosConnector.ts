import { BaseConnector } from "./baseConnector.js";
import type {
  ConnectorAuthResult,
  ConnectorMetadata,
  ConnectorRunContext,
  RawConnectorMetric
} from "./types.js";

interface CastosPodcast { id?: string | number; title?: string; name?: string; }
interface CastosPodcastResponse {
  data?: CastosPodcast[] | { podcast_list?: Record<string, string> };
  podcasts?: CastosPodcast[];
}
interface CastosEpisode {
  id?: string | number;
  title?: string;
  post_title?: string;
  date?: string;
  published_at?: string;
  post_date?: string;
  status?: string;
}

const CASTOS_API_BASE_URL = "https://app.castos.com/api/v2";

export class CastosConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "castos", name: "Castos Connector", sourceName: "Castos", category: "podcast",
    mode: "api", enabled: true,
    description: "Reads the configured podcast and episode inventory from Castos; analytics writes remain disabled pending capability validation."
  };

  async authenticate(context: ConnectorRunContext): Promise<ConnectorAuthResult> {
    const apiKey = process.env.CASTOS_API_KEY?.trim();
    const podcastId = process.env.CASTOS_PODCAST_ID?.trim();
    if (!apiKey) return { ok: false, status: "Needs Setup", message: "Missing CASTOS_API_KEY" };
    if (!podcastId) return { ok: false, status: "Needs Setup", message: "Missing CASTOS_PODCAST_ID" };
    try {
      const podcast = await this.fetchConfiguredPodcast(apiKey, podcastId);
      context.logger.info("Castos authentication diagnostic", {
        configuredPodcastId: podcastId,
        podcast: { id: podcast.id, title: podcast.title ?? podcast.name ?? "Untitled" }
      });
      return { ok: true, status: "Connected", message: `Castos API authenticated successfully for podcast ${podcastId}.` };
    } catch (error) {
      return { ok: false, status: "Error", message: `Castos API authentication failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const apiKey = process.env.CASTOS_API_KEY?.trim();
    const podcastId = process.env.CASTOS_PODCAST_ID?.trim();
    if (!apiKey || !podcastId) return [];
    const podcast = await this.fetchConfiguredPodcast(apiKey, podcastId);
    const episodes = await this.fetchEpisodes(apiKey, podcastId);
    context.logger.info("Castos configured podcast loaded", { id: podcast.id, title: podcast.title ?? podcast.name ?? "Untitled" });
    context.logger.info("Castos episode diagnostic", {
      podcastId,
      episodeCount: episodes.length,
      episodes: episodes.slice(0, 20).map((episode) => ({
        id: episode.id,
        title: episode.title ?? episode.post_title ?? "Untitled",
        publishedAt: episode.published_at ?? episode.post_date ?? episode.date ?? null,
        status: episode.status ?? null
      }))
    });
    return [];
  }

  protected async getMockMetrics(_context: ConnectorRunContext): Promise<RawConnectorMetric[]> { return []; }

  private async fetchConfiguredPodcast(apiKey: string, podcastId: string): Promise<CastosPodcast> {
    const podcasts = await this.fetchPodcasts(apiKey);
    const podcast = podcasts.find((item) => String(item.id) === podcastId);
    if (!podcast) throw new Error(`Configured CASTOS_PODCAST_ID ${podcastId} is not accessible to this Castos API key.`);
    return podcast;
  }

  private async fetchEpisodes(apiKey: string, podcastId: string): Promise<CastosEpisode[]> {
    const response = await fetch(`${CASTOS_API_BASE_URL}/podcasts/${encodeURIComponent(podcastId)}/episodes`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Castos episodes request failed (${response.status}): ${safeBody(body)}`);
    }
    const json = await response.json() as unknown;
    return extractEpisodes(json);
  }

  private async fetchPodcasts(apiKey: string): Promise<CastosPodcast[]> {
    const response = await fetch(`${CASTOS_API_BASE_URL}/podcasts`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Castos API request failed (${response.status}): ${safeBody(body)}`);
    }
    const json = await response.json() as CastosPodcastResponse | CastosPodcast[];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (json.data && !Array.isArray(json.data) && json.data.podcast_list) return Object.entries(json.data.podcast_list).map(([id, title]) => ({ id, title }));
    if (Array.isArray(json.podcasts)) return json.podcasts;
    return [];
  }
}

function extractEpisodes(value: unknown): CastosEpisode[] {
  if (Array.isArray(value)) return value as CastosEpisode[];
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["data", "episodes", "episode_list"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate as CastosEpisode[];
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      for (const nestedKey of ["episodes", "episode_list", "data"]) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as CastosEpisode[];
      }
    }
  }
  return [];
}

function safeBody(body: string): string { return body.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300); }
