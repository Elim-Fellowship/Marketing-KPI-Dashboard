import { AirtableClient } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import { createIngestionConnectors } from "../connectors/index.js";
import type { Logger } from "../logging/logger.js";
import { serializeError } from "../logging/logger.js";
import { SyncManager } from "./syncManager.js";

/**
 * Populate the normalized GA4 KPI history after a production service starts.
 *
 * The website connector upserts deterministic monthly records, so rerunning it
 * after a Render restart refreshes the same Airtable records rather than
 * creating duplicates. Failures are logged and deliberately do not terminate
 * the web service.
 */
export async function runStartupGa4Sync(config: AppConfig, logger: Logger): Promise<void> {
  if (!config.ga4.configured) {
    logger.info("Skipping startup GA4 sync because GA4 is not configured");
    return;
  }

  const connector = createIngestionConnectors().find((candidate) => candidate.metadata.id === "website");
  if (!connector) {
    logger.error("Skipping startup GA4 sync because the website connector is unavailable");
    return;
  }

  const airtable = new AirtableClient(config, logger.child("airtable"));
  const syncManager = new SyncManager({
    config,
    airtable,
    logger: logger.child("ingestion"),
    connectors: [connector]
  });

  try {
    logger.info("Starting GA4 website ingestion after service startup");
    const result = await syncManager.run({
      connectorId: "website",
      dryRun: false,
      requestedBy: "scheduled"
    });
    const websiteResult = result.results[0];
    logger.info("Startup GA4 website ingestion finished", {
      status: websiteResult?.status ?? "Unknown",
      metricsFetched: websiteResult?.metricsFetched ?? 0,
      recordsPrepared: websiteResult?.recordsPrepared ?? 0,
      durationMs: websiteResult?.durationMs ?? 0
    });
  } catch (error) {
    logger.error("Startup GA4 website ingestion failed", {
      error: serializeError(error)
    });
  }
}
