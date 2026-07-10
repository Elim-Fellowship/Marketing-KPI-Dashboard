import { AirtableClient } from "./airtable/client.js";
import { loadConfig } from "./config/env.js";
import { toPublicError } from "./errors.js";
import { createLogger, serializeError } from "./logging/logger.js";
import { KpiSyncService } from "./services/kpiSyncService.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("kpi-worker", config.logLevel);
  const airtable = new AirtableClient(config, logger.child("airtable"));
  const syncService = new KpiSyncService(config, airtable, logger.child("sync"));
  const result = await syncService.runSync();

  logger.info("Worker finished", {
    status: result.status,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    recordsFailed: result.recordsFailed
  });

  if (result.status === "Failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const fallbackLogger = createLogger("kpi-worker", "error");
  fallbackLogger.error("Worker failed", {
    error: serializeError(error),
    publicError: toPublicError(error)
  });
  process.exitCode = 1;
});
