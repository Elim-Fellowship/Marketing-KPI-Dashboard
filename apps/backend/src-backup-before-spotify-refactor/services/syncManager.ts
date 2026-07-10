import type { AirtableClient } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import type {
  CommunicationsConnector,
  ConnectorId,
  ConnectorRunContext,
  ConnectorSyncResult
} from "../connectors/types.js";
import { AppError } from "../errors.js";
import type { Logger } from "../logging/logger.js";
import {
  DATA_SOURCE_STATUS_FIELDS,
  statusFromSyncResult,
  toDataSourceStatusFields,
  type DataSourceStatusModel
} from "./dataSourceStatusModel.js";

interface SyncManagerOptions {
  config: AppConfig;
  airtable: AirtableClient;
  logger: Logger;
  connectors: CommunicationsConnector[];
}

export interface SyncManagerRunOptions {
  connectorId?: string;
  dryRun?: boolean;
  requestedBy?: "manual" | "scheduled" | "api";
  csv?: string;
}

export interface SyncManagerRunResult {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  results: ConnectorSyncResult[];
  statuses: DataSourceStatusModel[];
}

export class SyncManager {
  private readonly connectorsById = new Map<ConnectorId, CommunicationsConnector>();
  private readonly statusesBySource = new Map<string, DataSourceStatusModel>();
  private readonly history: ConnectorSyncResult[] = [];

  constructor(private readonly options: SyncManagerOptions) {
    for (const connector of options.connectors) {
      this.connectorsById.set(connector.metadata.id, connector);
    }
  }

  listConnectors(): Array<CommunicationsConnector["metadata"]> {
    return [...this.connectorsById.values()].map((connector) => connector.metadata);
  }

  getStatuses(): DataSourceStatusModel[] {
    return [...this.statusesBySource.values()].sort((left, right) =>
      right.lastSyncTime.localeCompare(left.lastSyncTime)
    );
  }

  getHistory(limit = 25): ConnectorSyncResult[] {
    return this.history.slice(-limit).reverse();
  }

  async run(options: SyncManagerRunOptions = {}): Promise<SyncManagerRunResult> {
    console.log("SYNC OPTIONS:", options);
    const startedAt = new Date().toISOString();
    const dryRun = options.dryRun ?? true;
    const requestedBy = options.requestedBy ?? "manual";
    const connectors = options.connectorId
      ? [this.requireConnector(options.connectorId)]
      : [...this.connectorsById.values()];
    const results: ConnectorSyncResult[] = [];
    const statuses: DataSourceStatusModel[] = [];

    for (const connector of connectors) {
      const context: ConnectorRunContext = {
        airtable: this.options.airtable,
        csv: options.csv,
        config: this.options.config,
        logger: this.options.logger.child(connector.metadata.id),
        startedAt: new Date().toISOString(),
        dryRun,
        requestedBy
      };
      const result = await connector.sync(context);
      if (result.data && connector.metadata.id === "spotify") {
  for (const row of result.data) {
await this.options.airtable.createRecord(
  this.options.config.airtable.tables.spotifyWeeklySnapshot,
      {
        "Episode Name": row.episodeName,
        "Total Streams": row.totalStreams,
        "Publish Date": row.publishDate,
      }
    );
  }
}

const status = statusFromSyncResult(result, connector.metadata.mode !== "api");


      this.history.push(result);
      this.statusesBySource.set(status.sourceName, status);
      results.push(result);
      statuses.push(status);

      if (!dryRun) {
        await this.persistStatus(status);
      }
    }

    return {
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
      statuses
    };
  }

  private requireConnector(connectorId: string): CommunicationsConnector {
    const connector = this.connectorsById.get(connectorId as ConnectorId);
    if (!connector) {
      throw new AppError("VALIDATION_FAILED", `Unknown connector: ${connectorId}`, {
        connectorId,
        availableConnectors: [...this.connectorsById.keys()]
      });
    }

    return connector;
  }

  private async persistStatus(status: DataSourceStatusModel): Promise<void> {
    const tableName = this.options.config.airtable.tables.dataSourceStatus;
    await this.options.airtable.upsertByUniqueKey(
      tableName,
      DATA_SOURCE_STATUS_FIELDS.sourceName,
      status.sourceName,
      toDataSourceStatusFields(status)
    );
  }
}
