import { AirtableClient } from "./airtable/client.js";
import { loadConfig } from "./config/env.js";
import { toPublicError } from "./errors.js";
import { createLogger, serializeError } from "./logging/logger.js";
import { KpiSyncService } from "./services/kpiSyncService.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("kpi-verify", config.logLevel);
  const airtable = new AirtableClient(config, logger.child("airtable"));
  const syncService = new KpiSyncService(config, airtable, logger.child("sync"));

  await syncService.verifyAirtableSetup();
  logger.info("Airtable setup verified", {
    tables: config.airtable.tables
  });
}

main().catch((error) => {
  const fallbackLogger = createLogger("kpi-verify", "error");
  fallbackLogger.error("Verification failed", {
    error: serializeError(error),
    publicError: toPublicError(error)
  });
  process.exitCode = 1;
});
