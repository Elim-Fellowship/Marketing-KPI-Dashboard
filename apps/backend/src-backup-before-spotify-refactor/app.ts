import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AirtableClient } from "./airtable/client.js";
import { FIELDS } from "./config/airtableSchema.js";
import type { AppConfig } from "./config/env.js";
import { createIngestionConnectors, futureConnectorPlaceholders } from "./connectors/index.js";
import { isAppError, toPublicError } from "./errors.js";
import type { Logger } from "./logging/logger.js";
import { serializeError } from "./logging/logger.js";
import { AirtableService } from "./services/airtableService.js";
import { CommunicationsAnalyticsService } from "./services/communicationsAnalyticsService.js";
import { DataHealthService } from "./services/dataHealthService.js";
import { KpiSyncService } from "./services/kpiSyncService.js";
import { MailchimpService } from "./services/mailchimpService.js";
import { SyncManager } from "./services/syncManager.js";
import type { AirtableTableKey } from "./types/airtableTables.js";

export function createApp(config: AppConfig, logger: Logger): express.Express {
  const app = express();
  const airtable = new AirtableClient(config, logger.child("airtable"));
  const airtableService = new AirtableService(config, airtable);
  const syncService = new KpiSyncService(config, airtable, logger.child("sync"));
  const analyticsService = new CommunicationsAnalyticsService(config, airtableService);
  const dataHealthService = new DataHealthService(airtableService);
  const mailchimpService = new MailchimpService(config, airtable, logger.child("mailchimp"));
  const ingestionSyncManager = new SyncManager({
    config,
    airtable,
    logger: logger.child("ingestion"),
    connectors: createIngestionConnectors()
  });

  app.use(cors({ origin: config.frontendOrigin === "*" ? true : config.frontendOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger(logger));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "communications-intelligence-platform",
      stage: "communications-analytics"
    });
  });

  app.post("/sync", requireSyncAuth(config), asyncHandler(async (_request, response) => {
    const result = await syncService.runSync();
    response.status(result.status === "Success" ? 200 : 500).json({ result });
  }));

  app.get("/kpis", asyncHandler(async (request, response) => {
    const records = await airtableService.getRecords("kpis", {
      maxRecords: parseLimit(request.query.limit),
      sort: [{ field: FIELDS.kpis.name, direction: "asc" }]
    });

    response.json({ records });
  }));

  app.get("/records", asyncHandler(async (request, response) => {
    const records = await airtableService.getRecords("kpiRecords", {
      maxRecords: parseLimit(request.query.limit),
      sort: [{ field: FIELDS.records.reportingDate, direction: "desc" }]
    });

    response.json({ records });
  }));

  app.get("/jobs", asyncHandler(async (request, response) => {
    const records = await airtable.findRecords(config.airtable.tables.importJobs, {
      maxRecords: parseLimit(request.query.limit),
      sort: [{ field: FIELDS.jobs.startedAt, direction: "desc" }]
    });

    response.json({ records });
  }));

  app.get("/api/home", asyncHandler(async (_request, response) => {
    response.json(await analyticsService.getHomepage());
  }));

  app.get("/api/overview", asyncHandler(async (request, response) => {
    response.json(await analyticsService.getOverview({
      startDate: optionalString(request.query.startDate),
      endDate: optionalString(request.query.endDate),
      dateMode: optionalString(request.query.dateMode)
    }));
  }));

  app.get("/api/top-content", asyncHandler(async (request, response) => {
    response.json(await analyticsService.getTopContent({
      timeframe: optionalString(request.query.timeframe),
      platform: optionalString(request.query.platform),
      groupBy: optionalString(request.query.groupBy)
    }));
  }));

  app.get("/api/comparative", asyncHandler(async (request, response) => {
    response.json(await analyticsService.getComparative({
      period: optionalString(request.query.period)
    }));
  }));

  app.get("/api/channel-breakdown", asyncHandler(async (request, response) => {
    response.json(await analyticsService.getChannelBreakdown({
      startDate: optionalString(request.query.startDate),
      endDate: optionalString(request.query.endDate),
      dateMode: optionalString(request.query.dateMode)
    }));
  }));

  app.get("/api/status", asyncHandler(async (_request, response) => {
    response.json(await analyticsService.getStatus());
  }));

  app.get("/api/data-health", asyncHandler(async (_request, response) => {
    response.json(await dataHealthService.getDataHealth());
  }));

  app.get("/api/integrations/mailchimp/sync", requireSyncAuth(config), asyncHandler(async (request, response) => {
    const result = await mailchimpService.sync({
      periodType: optionalString(request.query.periodType)
    });

    response.json({ result });
  }));

  app.get("/api/integrations/mailchimp/status", (_request, response) => {
    response.json({
      status: mailchimpService.getStatus()
    });
  });

  app.get("/api/debug/sync-auth", (_request, response) => {
    response.json({
      syncApiKeyConfigured: Boolean(config.syncApiKey),
      syncApiKeyLength: config.syncApiKey?.length ?? 0,
      syncApiKeyStartsWith: config.syncApiKey?.slice(0, 3) ?? null,
      nodeEnv: config.nodeEnv
    });
  });

  app.get("/api/ingestion/connectors", (_request, response) => {
    response.json({
      connectors: ingestionSyncManager.listConnectors(),
      futureConnectors: futureConnectorPlaceholders
    });
  });

  app.get("/api/ingestion/status", (_request, response) => {
    response.json({
      statuses: ingestionSyncManager.getStatuses(),
      history: ingestionSyncManager.getHistory()
    });
  });

  app.post("/api/ingestion/sync", requireSyncAuth(config), asyncHandler(async (request, response) => {
    const result = await ingestionSyncManager.run({
      connectorId: optionalString(request.body?.connectorId) ?? optionalString(request.query.connectorId),
      dryRun: parseBoolean(request.body?.dryRun ?? request.query.dryRun, true),
      requestedBy: "api",
      csv: request.body?.csv,
    });

    response.json({ result });
  }));

  app.get("/api/airtable", asyncHandler(async (_request, response) => {
    response.json({
      tables: await airtableService.getAllRequestedTables()
    });
  }));

  app.get("/api/comms/tables", asyncHandler(async (_request, response) => {
    response.json({
      tables: await airtableService.getCommunicationsTables()
    });
  }));

  for (const route of communicationsRoutes) {
    app.get(route.path, asyncHandler(async (_request, response) => {
      response.json({
        table: route.tableKey,
        records: await airtableService.getRecords(route.tableKey)
      });
    }));
  }

  for (const route of airtableRoutes) {
    app.get(route.path, asyncHandler(async (_request, response) => {
      response.json({
        table: route.tableKey,
        records: await airtableService.getRecords(route.tableKey)
      });
    }));
  }

  const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
  app.use(express.static(publicDir));

  app.get(frontendRoutes, (_request, response) => {
    response.sendFile(resolve(publicDir, "index.html"));
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    logger.error("Request failed", {
      error: serializeError(error)
    });

    const publicError = toPublicError(error);
    response.status(isAppError(error) ? 400 : 500).json({
      error: publicError
    });
  });

  return app;
}

function requestLogger(logger: Logger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    response.on("finish", () => {
      logger.info("HTTP request", {
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  };
}

function requireSyncAuth(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!config.syncApiKey && config.nodeEnv === "production") {
      response.status(503).json({
        error: {
          code: "MISSING_ENV",
          message: "SYNC_API_KEY is required in production"
        }
      });
      return;
    }

    if (!config.syncApiKey) {
      next();
      return;
    }

    const token = getBearerToken(request);
    if (token !== config.syncApiKey) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing bearer token"
        }
      });
      return;
    }

    next();
  };
}

function getBearerToken(request: Request): string | undefined {
  const header = request.header("authorization");
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response, next).catch(next);
  };
}

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "100"), 10);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(Math.max(parsed, 1), 100);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return fallback;
}

const airtableRoutes: Array<{ path: string; tableKey: AirtableTableKey }> = [
  { path: "/api/airtable/kpi-sources", tableKey: "kpiSources" },
  { path: "/api/airtable/kpis", tableKey: "kpis" },
  { path: "/api/airtable/kpi-records", tableKey: "kpiRecords" },
  { path: "/api/airtable/dashboard-views", tableKey: "dashboardViews" },
  { path: "/api/airtable/alerts", tableKey: "alerts" },
  { path: "/api/airtable/spotify-weekly-snapshot", tableKey: "spotifyWeeklySnapshot" },
  { path: "/api/airtable/content-performance", tableKey: "contentPerformance" },
  { path: "/api/airtable/kpi-history", tableKey: "kpiHistory" },
  { path: "/api/airtable/data-source-status", tableKey: "dataSourceStatus" },
  { path: "/api/airtable/channel-performance", tableKey: "channelPerformance" },
  { path: "/api/airtable/monthly-activity-summary", tableKey: "monthlyActivitySummary" }
];

const communicationsRoutes: Array<{ path: string; tableKey: AirtableTableKey }> = [
{ 
  path: "/api/comms/spotify-weekly-snapshot",
  tableKey: "spotifyWeeklySnapshot"
},
  { path: "/api/comms/spotify-weekly-snapshot", tableKey: "spotifyWeeklySnapshot" },
  { path: "/api/comms/content-performance", tableKey: "contentPerformance" },
  { path: "/api/comms/kpi-history", tableKey: "kpiHistory" },
  { path: "/api/comms/data-source-status", tableKey: "dataSourceStatus" },
  { path: "/api/comms/channel-performance", tableKey: "channelPerformance" },
  { path: "/api/comms/monthly-activity-summary", tableKey: "monthlyActivitySummary" }
];

const frontendRoutes = [
  "/",
  "/top-performing-content",
  "/channel-breakdown",
  "/comparative"
];
