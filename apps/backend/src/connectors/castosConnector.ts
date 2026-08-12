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
  created_at?: string;
  published_at?: string;
  post_date?: string;
  status?: string;
}

const CASTOS_API_BASE_URL = "https://app.castos.com/api/v2";
const CASTOS_HISTORY_START = "2026-06-01";

export class CastosConnector extends BaseConnector {
  readonly metadata: ConnectorMetadata = {
    id: "castos",
    name: "Castos Connector",
    sourceName: "Castos",
    category: "podcast",
    mode: "api",
    enabled: true,
    description: "Ingests real episode publishing activity for the configured Castos podcast. Download analytics remain excluded until Castos exposes a supported analytics source."
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
      return {
        ok: true,
        status: "Connected",
        message: `Castos API authenticated successfully for podcast ${podcastId}.`
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
    const podcastId = process.env.CASTOS_PODCAST_ID?.trim();
    if (!apiKey || !podcastId) return [];

    const podcast = await this.fetchConfiguredPodcast(apiKey, podcastId);
    const episodes = await this.fetchEpisodes(apiKey, podcastId);
    const metrics = episodes
      .map((episode) => toEpisodeMetric(episode, podcastId))
      .filter((metric): metric is RawConnectorMetric => Boolean(metric))
      .filter((metric) => metric.date >= CASTOS_HISTORY_START);

    context.logger.info("Castos production episode activity prepared", {
      podcastId,
      podcastTitle: podcast.title ?? podcast.name ?? "Untitled",
      episodeInventoryCount: episodes.length,
      metricsPrepared: metrics.length,
      historyStart: CASTOS_HISTORY_START
    });

    return metrics;
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
    const response = await fetch(`${CASTOS_API_BASE_URL}/podcasts`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Castos API request failed (${response.status}): ${safeBody(body)}`);
    }
    const json = await response.json() as CastosPodcastResponse | CastosPodcast[];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (json.data && !Array.isArray(json.data) && json.data.podcast_list) {
      return Object.entries(json.data.podcast_list).map(([id, title]) => ({ id, title }));
    }
    if (Array.isArray(json.podcasts)) return json.podcasts;
    return [];
  }
}

function toEpisodeMetric(episode: CastosEpisode, podcastId: string): RawConnectorMetric | undefined {
  if (episode.id === undefined || episode.id === null) return undefined;
  const rawDate = episode.published_at ?? episode.post_date ?? episode.date ?? episode.created_at;
  const date = normalizeDate(rawDate);
  if (!date) return undefined;

  return {
    sourceRecordId: String(episode.id),
    metricName: "Podcasts Published",
    value: 1,
    unit: "episodes",
    date,
    targetTableKey: "contentPerformance",
    platform: "Castos",
    channel: "Podcast",
    contentTitle: episode.title ?? episode.post_title ?? `Castos Episode ${episode.id}`,
    contentType: "Podcast Episode",
    activityVolume: 1,
    dimensions: { podcastId }
  };
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
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

function safeBody(body: string): string {
  return body.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 300);
}
