import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { toPublicError } from "./errors.js";
import { createLogger, serializeError } from "./logging/logger.js";

try {
  const config = loadConfig();
  const logger = createLogger("kpi-api", config.logLevel);
  const app = createApp(config, logger);

  const server = app.listen(config.port, config.host, () => {
    logger.info("KPI backend listening", {
      host: config.host,
      port: config.port,
      nodeEnv: config.nodeEnv
    });
  });

  server.on("error", (error) => {
    logger.error("Server error", {
      error: serializeError(error)
    });
    process.exitCode = 1;
  });
} catch (error) {
  const logger = createLogger("kpi-api", "error");
  logger.error("Failed to start backend", {
    error: serializeError(error),
    publicError: toPublicError(error)
  });
  process.exitCode = 1;
}
