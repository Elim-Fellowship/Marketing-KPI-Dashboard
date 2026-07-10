import type { KpiConnector } from "../types/kpi.js";
import { exampleConnector } from "./exampleConnector.js";

export function getConnector(): KpiConnector {
  return exampleConnector;
}

export { createIngestionConnectors, futureConnectorPlaceholders } from "./registry.js";
export type {
  CommunicationsConnector,
  ConnectorAirtablePayload,
  ConnectorAirtableRecord,
  ConnectorAuthResult,
  ConnectorId,
  ConnectorMetadata,
  ConnectorRunContext,
  ConnectorSyncResult,
  ConnectorWriteResult,
  RawConnectorMetric
} from "./types.js";
