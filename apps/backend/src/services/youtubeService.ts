import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config/env.js";

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface PendingState {
  expiresAt: number;
}

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface YouTubeTestResult {
  configured: boolean;
  authorized: boolean;
  channel?: { id: string; title: string };
  dateRange: { startDate: string; endDate: string };
  videosPublished: number;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDurationSeconds: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  subscribersLost: number;
  writesPerformed: false;
}

export class YouTubeService {
  private readonly states = new Map<string, PendingState>();
  private token?: StoredToken;

  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return this.config.youtube.configured;
  }

  get authorized(): boolean {
    return Boolean(this.config.youtube.refreshToken || this.token?.refreshToken || this.token?.accessToken);
  }

  createAuthorizationUrl(): string {
    this.assertConfigured();
    const state = randomUUID();
    this.states.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 });
    this.pruneStates();

    const params = new URLSearchParams({
      client_id: this.config.youtube.clientId!,
      redirect_uri: this.config.youtube.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly"
      ].join(" "),
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ refreshToken?: string; channel: { id: string; title: string } }> {
    this.assertConfigured();
    const pending = this.states.get(state);
    this.states.delete(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error("YouTube OAuth state is invalid or expired. Start authorization again.");
    }

    const token = await this.exchangeCode(code);
    if (!token.access_token) {
      throw new Error(token.error_description ?? token.error ?? "Google did not return a YouTube access token.");
    }

    this.token = {
      accessToken: token.access_token,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
      refreshToken: token.refresh_token
    };

    const channel = await this.fetchChannel(token.access_token);
    return { refreshToken: token.refresh_token, channel };
  }

  async test(startDate: string, endDate: string): Promise<YouTubeTestResult> {
    this.assertConfigured();
    validateDate(startDate);
    validateDate(endDate);
    if (startDate > endDate) throw new Error("YouTube startDate must be on or before endDate.");

    const accessToken = await this.getAccessToken();
    const channel = await this.fetchChannel(accessToken);
    const [analytics, videosPublished] = await Promise.all([
      this.fetchAnalytics(accessToken, startDate, endDate),
      this.countPublishedVideos(accessToken, startDate, endDate)
    ]);

    return {
      configured: true,
      authorized: true,
      channel,
      dateRange: { startDate, endDate },
      videosPublished,
      ...analytics,
      writesPerformed: false
    };
  }

  private async exchangeCode(code: string): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.youtube.clientId!,
      client_secret: this.config.youtube.clientSecret!,
      redirect_uri: this.config.youtube.redirectUri,
      grant_type: "authorization_code"
    });
    return fetchJson<OAuthTokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.token?.accessToken && this.token.expiresAt > Date.now() + 60_000) return this.token.accessToken;
    const refreshToken = this.config.youtube.refreshToken ?? this.token?.refreshToken;
    if (!refreshToken) throw new Error("YouTube is not authorized yet. Complete the OAuth flow first.");

    const body = new URLSearchParams({
      client_id: this.config.youtube.clientId!,
      client_secret: this.config.youtube.clientSecret!,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    });
    const token = await fetchJson<OAuthTokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!token.access_token) throw new Error(token.error_description ?? token.error ?? "Unable to refresh YouTube access token.");
    this.token = {
      accessToken: token.access_token,
      expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
      refreshToken
    };
    return token.access_token;
  }

  private async fetchChannel(accessToken: string): Promise<{ id: string; title: string }> {
    const data = await googleGet<{ items?: Array<{ id?: string; snippet?: { title?: string } }> }>(
      "https://www.googleapis.com/youtube/v3/channels",
      { part: "snippet", mine: "true" },
      accessToken
    );
    const item = data.items?.[0];
    if (!item?.id) throw new Error("No YouTube channel was found for the authorized Google account.");
    return { id: item.id, title: item.snippet?.title ?? "YouTube" };
  }

  private async fetchAnalytics(accessToken: string, startDate: string, endDate: string) {
    const metrics = ["views", "estimatedMinutesWatched", "averageViewDuration", "likes", "comments", "subscribersGained", "subscribersLost"];
    const data = await googleGet<{ rows?: unknown[][] }>(
      "https://youtubeanalytics.googleapis.com/v2/reports",
      { ids: "channel==MINE", startDate, endDate, metrics: metrics.join(",") },
      accessToken
    );
    const row = data.rows?.[0] ?? [];
    return {
      views: finite(row[0]),
      estimatedMinutesWatched: finite(row[1]),
      averageViewDurationSeconds: finite(row[2]),
      likes: finite(row[3]),
      comments: finite(row[4]),
      subscribersGained: finite(row[5]),
      subscribersLost: finite(row[6])
    };
  }

  private async countPublishedVideos(accessToken: string, startDate: string, endDate: string): Promise<number> {
    const channel = await googleGet<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
      "https://www.googleapis.com/youtube/v3/channels",
      { part: "contentDetails", mine: "true" },
      accessToken
    );
    const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return 0;

    let pageToken: string | undefined;
    let count = 0;
    do {
      const data = await googleGet<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoPublishedAt?: string }; snippet?: { publishedAt?: string } }> }>(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        { part: "contentDetails,snippet", playlistId: uploads, maxResults: "50", ...(pageToken ? { pageToken } : {}) },
        accessToken
      );
      for (const item of data.items ?? []) {
        const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
        if (!publishedAt) continue;
        const day = publishedAt.slice(0, 10);
        if (day >= startDate && day <= endDate) count += 1;
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return count;
  }

  private assertConfigured(): void {
    if (!this.config.youtube.configured) throw new Error("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required.");
  }

  private pruneStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.states) if (entry.expiresAt < now) this.states.delete(state);
  }
}

async function googleGet<T>(url: string, params: Record<string, string>, accessToken: string): Promise<T> {
  const query = new URLSearchParams(params);
  return fetchJson<T>(`${url}?${query.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: any;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
  if (!response.ok) {
    const message = parsed?.error?.message ?? parsed?.error_description ?? parsed?.message ?? `HTTP ${response.status}`;
    throw new Error(`YouTube API request failed: ${message}`);
  }
  return parsed as T;
}

function validateDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`);
}

function finite(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
