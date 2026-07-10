import type { AirtableClient, AirtableFields } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../logging/logger.js";
import type { AirtableTableKey } from "../types/airtableTables.js";

export type ConnectorId =
  | "mailchimp"
  | "castos"
  | "youtube"
  | "website"
  | "spotify"
  | "facebook"
  | "instagram";

export type ConnectorCategory =
  | "email"
  | "podcast"
  | "video"
  | "website"
  | "streaming"
  | "social";

export type ConnectorMode = "mock" | "manual" | "api" | "future";

export type ConnectionStatus = "Connected" | "Disconnected" | "Needs Setup" | "Error";

export type ConnectorSyncStatus = "Success" | "Failed" | "Skipped";

export interface ConnectorMetadata {
  id: ConnectorId;
  name: string;
  sourceName: string;
  category: ConnectorCategory;
  mode: ConnectorMode;
  enabled: boolean;
  description: string;
}

export interface ConnectorRunContext {
  airtable: AirtableClient;
  config: AppConfig;
  logger: Logger;
  startedAt: string;
  dryRun: boolean;
  requestedBy: "manual" | "scheduled" | "api";
}

export interface ConnectorAuthResult {
  ok: boolean;
  status: ConnectionStatus;
  message: string;
}

export interface RawConnectorMetric {
  sourceRecordId: string;
  metricName: string;
  value: number;
  unit: string;
  date: string;
  targetTableKey: AirtableTableKey;
  platform?: string;
  channel?: string;
  contentTitle?: string;
  contentType?: string;
  campaign?: string;
  activityVolume?: number;
  dimensions?: Record<string, string | number | boolean>;
}

export interface NormalizedConnectorMetric {
  uniqueKey: string;
  connectorId: ConnectorId;
  sourceName: string;
  metricName: string;
  value: number;
  unit: string;
  date: string;
  targetTableKey: AirtableTableKey;
  platform?: string;
  channel?: string;
  contentTitle?: string;
  contentType?: string;
  campaign?: string;
  activityVolume?: number;
  dimensions?: Record<string, string | number | boolean>;
}

export interface ConnectorAirtableRecord {
  tableKey: AirtableTableKey;
  fields: AirtableFields;
  uniqueKey: {
    fieldName: string;
    value: string;
  };
}

export interface ConnectorAirtablePayload {
  metrics: NormalizedConnectorMetric[];
  records: ConnectorAirtableRecord[];
}

export interface ConnectorWriteResult {
  attempted: number;
  created: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
}

export interface ConnectorSyncResult {
  connectorId: ConnectorId;
  sourceName: string;
  status: ConnectorSyncStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  metricsFetched: number;
  recordsPrepared: number;
  writeResult: ConnectorWriteResult;
  errorMessage?: string;
}

export interface CommunicationsConnector {
  metadata: ConnectorMetadata;
  authenticate(context: ConnectorRunContext): Promise<ConnectorAuthResult>;
  fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]>;
  transformData(
    metrics: RawConnectorMetric[],
    context: ConnectorRunContext
  ): Promise<ConnectorAirtablePayload>;
  writeToAirtable(
    payload: ConnectorAirtablePayload,
    context: ConnectorRunContext
  ): Promise<ConnectorWriteResult>;
  sync(context: ConnectorRunContext): Promise<ConnectorSyncResult>;
}
