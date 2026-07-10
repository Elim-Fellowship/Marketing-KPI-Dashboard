import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LogLevel } from "../logging/logger.js";
import { AppError } from "../errors.js";

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  frontendOrigin: string;
  syncApiKey?: string;
  mailchimp: {
    apiKey?: string;
    serverPrefix?: string;
    audienceId?: string;
    apiBaseUrl?: string;
    configured: boolean;
  };
  airtable: {
    apiKey: string;
    baseId: string;
    apiBaseUrl: string;
    rateLimitMs: number;
    cacheTtlMs: number;
    tables: {
      kpiSources: string;
      kpis: string;
      kpiRecords: string;
      importJobs: string;
      dashboardViews: string;
      alerts: string;
      spotifyWeeklySnapshot: string;
spotifyEpisodeMetrics: string;      
contentPerformance: string;
      kpiHistory: string;
      dataSourceStatus: string;
      channelPerformance: string;
      monthlyActivitySummary: string;
    };
  };
}

export function loadConfig(): AppConfig {
  loadEnvFiles();

  const missing: string[] = [];
  const airtableApiKey = readOptionalString("AIRTABLE_PAT") ?? readOptionalString("AIRTABLE_API_KEY");
  const airtableBaseId = readOptionalString("AIRTABLE_BASE_ID");

  if (!airtableApiKey) {
    missing.push("AIRTABLE_PAT");
  }

  if (!airtableBaseId) {
    missing.push("AIRTABLE_BASE_ID");
  }

  if (missing.length > 0) {
    throw new AppError(
      "MISSING_ENV",
      `Missing required environment variables: ${missing.join(", ")}`,
      { missing }
    );
  }

  return {
    nodeEnv: readString("NODE_ENV", "development"),
    host: readString("HOST", "0.0.0.0"),
    port: readInteger("PORT", 3000),
    logLevel: readLogLevel("LOG_LEVEL", "info"),
    frontendOrigin: readString("FRONTEND_ORIGIN", "*"),
    syncApiKey: readOptionalString("SYNC_API_KEY"),
    mailchimp: {
      apiKey: readOptionalString("MAILCHIMP_API_KEY"),
      serverPrefix: readOptionalString("MAILCHIMP_SERVER_PREFIX"),
      audienceId: readOptionalString("MAILCHIMP_AUDIENCE_ID"),
      apiBaseUrl: readOptionalString("MAILCHIMP_API_BASE_URL"),
      configured: Boolean(
        readOptionalString("MAILCHIMP_API_KEY") &&
        readOptionalString("MAILCHIMP_SERVER_PREFIX") &&
        readOptionalString("MAILCHIMP_AUDIENCE_ID")
      )
    },
    airtable: {
      apiKey: airtableApiKey!,
      baseId: airtableBaseId!,
      apiBaseUrl: readString("AIRTABLE_API_BASE_URL", "https://api.airtable.com/v0"),
      rateLimitMs: readInteger("AIRTABLE_RATE_LIMIT_MS", 250),
      cacheTtlMs: readInteger("AIRTABLE_CACHE_TTL_MS", 60000),
      tables: {
        kpiSources: readString("AIRTABLE_TABLE_KPI_SOURCES", "KPI Sources"),
        kpis: readString("AIRTABLE_TABLE_KPIS", "KPIs"),
        kpiRecords: readString("AIRTABLE_TABLE_KPI_RECORDS", "KPI Records"),
        importJobs: readString("AIRTABLE_TABLE_IMPORT_JOBS", "Import Jobs"),
        dashboardViews: readString("AIRTABLE_TABLE_DASHBOARD_VIEWS", "Dashboard Views"),
        alerts: readString("AIRTABLE_TABLE_ALERTS", "Alerts"),
        spotifyWeeklySnapshot: readString(
          "AIRTABLE_TABLE_SPOTIFY_WEEKLY_SNAPSHOT",
          "Spotify_Weekly_Snapshot"
        ),
spotifyEpisodeMetrics: readString(
  "AIRTABLE_TABLE_SPOTIFY_EPISODE_METRICS",
  "Spotify_Episode_Metrics"
),
spotifyEpisodeMetrics: readString(
  "AIRTABLE_TABLE_SPOTIFY_EPISODE_METRICS",
  "Spotify_Episode_Metrics"
),
        contentPerformance: readString(
          "AIRTABLE_TABLE_CONTENT_PERFORMANCE",
          "Content_Performance"
        ),
        kpiHistory: readString("AIRTABLE_TABLE_KPI_HISTORY", "KPI_History"),
        dataSourceStatus: readString(
          "AIRTABLE_TABLE_DATA_SOURCE_STATUS",
          "Data_Source_Status"
        ),
        channelPerformance: readString(
          "AIRTABLE_TABLE_CHANNEL_PERFORMANCE",
          "Channel_Performance"
        ),
        monthlyActivitySummary: readString(
          "AIRTABLE_TABLE_MONTHLY_ACTIVITY_SUMMARY",
          "Monthly_Activity_Summary"
        )
      }
    }
  };
}

function loadEnvFiles(): void {
  const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const repoRoot = resolve(backendRoot, "..", "..");
  const candidates = new Set([
    resolve(repoRoot, ".env"),
    resolve(backendRoot, ".env"),
    resolve(process.cwd(), ".env"),
    resolve(repoRoot, ".env.local"),
    resolve(backendRoot, ".env.local"),
    resolve(process.cwd(), ".env.local")
  ]);

  for (const filePath of candidates) {
    loadEnvFile(filePath);
  }
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry) {
      continue;
    }

    const [key, value] = entry;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const separatorIndex = withoutExport.indexOf("=");
  if (separatorIndex === -1) {
    return undefined;
  }

  const key = withoutExport.slice(0, separatorIndex).trim();
  let value = withoutExport.slice(separatorIndex + 1).trim();

  if (!key) {
    return undefined;
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value.replace(/\\n/g, "\n")];
}

function readOptionalString(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function readString(key: string, fallback: string): string {
  return readOptionalString(key) ?? fallback;
}

function readInteger(key: string, fallback: number): number {
  const raw = readOptionalString(key);
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be an integer`);
  }

  return value;
}

function readLogLevel(key: string, fallback: LogLevel): LogLevel {
  const value = readString(key, fallback);
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  throw new Error(`${key} must be one of debug, info, warn, or error`);
}
