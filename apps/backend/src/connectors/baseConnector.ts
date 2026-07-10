import type { AirtableFields } from "../airtable/client.js";
import { serializeError } from "../logging/logger.js";
import type {
  CommunicationsConnector,
  ConnectorAirtablePayload,
  ConnectorAirtableRecord,
  ConnectorAuthResult,
  ConnectorMetadata,
  ConnectorRunContext,
  ConnectorSyncResult,
  ConnectorWriteResult,
  NormalizedConnectorMetric,
  RawConnectorMetric
} from "./types.js";

const UNIQUE_KEY_FIELD = "Unique Key";

export abstract class BaseConnector implements CommunicationsConnector {
  abstract readonly metadata: ConnectorMetadata;

  async authenticate(_context: ConnectorRunContext): Promise<ConnectorAuthResult> {
    if (!this.metadata.enabled) {
      return {
        ok: false,
        status: "Needs Setup",
        message: `${this.metadata.name} is registered but not enabled yet.`
      };
    }

    return {
      ok: true,
      status: "Connected",
      message: `${this.metadata.name} is using mock authentication.`
    };
  }

  async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    context.logger.info("Fetching connector metrics", {
      connectorId: this.metadata.id,
      mode: this.metadata.mode
    });

    return this.getMockMetrics(context);
  }

  async transformData(
    metrics: RawConnectorMetric[],
    _context: ConnectorRunContext
  ): Promise<ConnectorAirtablePayload> {
    const normalized = metrics.map((metric) => this.normalizeMetric(metric));

    return {
      metrics: normalized,
      records: normalized.map((metric) => this.toAirtableRecord(metric))
    };
  }

  async writeToAirtable(
    payload: ConnectorAirtablePayload,
    context: ConnectorRunContext
  ): Promise<ConnectorWriteResult> {
    if (context.dryRun) {
      return {
        attempted: payload.records.length,
        created: 0,
        updated: 0,
        skipped: payload.records.length,
        dryRun: true
      };
    }

    let created = 0;
    let updated = 0;

    for (const record of payload.records) {
      const tableName = context.config.airtable.tables[record.tableKey];
      const result = await context.airtable.upsertByUniqueKey(
        tableName,
        record.uniqueKey.fieldName,
        record.uniqueKey.value,
        record.fields
      );

      if (result.created) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    return {
      attempted: payload.records.length,
      created,
      updated,
      skipped: 0,
      dryRun: false
    };
  }

  async sync(context: ConnectorRunContext): Promise<ConnectorSyncResult> {
    const startedAtMs = Date.now();

    try {
      const auth = await this.authenticate(context);
      if (!auth.ok) {
        const finishedAt = new Date().toISOString();
        return {
          connectorId: this.metadata.id,
          sourceName: this.metadata.sourceName,
          status: "Skipped",
          startedAt: context.startedAt,
          finishedAt,
          durationMs: Date.now() - startedAtMs,
          metricsFetched: 0,
          recordsPrepared: 0,
          writeResult: emptyWriteResult(context.dryRun),
          errorMessage: auth.message
        };
      }

      const rawMetrics = await this.fetchMetrics(context);
      const payload = await this.transformData(rawMetrics, context);
      const writeResult = await this.writeToAirtable(payload, context);
      const finishedAt = new Date().toISOString();

      return {
        connectorId: this.metadata.id,
        sourceName: this.metadata.sourceName,
        status: "Success",
        startedAt: context.startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtMs,
        metricsFetched: rawMetrics.length,
        recordsPrepared: payload.records.length,
        writeResult
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      context.logger.error("Connector sync failed", {
        connectorId: this.metadata.id,
        error: serializeError(error)
      });

      return {
        connectorId: this.metadata.id,
        sourceName: this.metadata.sourceName,
        status: "Failed",
        startedAt: context.startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtMs,
        metricsFetched: 0,
        recordsPrepared: 0,
        writeResult: emptyWriteResult(context.dryRun),
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  protected abstract getMockMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]>;

  protected normalizeMetric(metric: RawConnectorMetric): NormalizedConnectorMetric {
    const date = metric.date || new Date().toISOString().slice(0, 10);
    const uniqueParts = [
      this.metadata.id,
      metric.sourceRecordId,
      metric.metricName,
      date,
      metric.platform ?? this.metadata.sourceName
    ];

    return {
      uniqueKey: uniqueParts.join(":").toLowerCase().replace(/\s+/g, "-"),
      connectorId: this.metadata.id,
      sourceName: this.metadata.sourceName,
      metricName: metric.metricName,
      value: metric.value,
      unit: metric.unit,
      date,
      targetTableKey: metric.targetTableKey,
      platform: metric.platform,
      channel: metric.channel,
      contentTitle: metric.contentTitle,
      contentType: metric.contentType,
      campaign: metric.campaign,
      activityVolume: metric.activityVolume,
      dimensions: metric.dimensions
    };
  }

  protected toAirtableRecord(metric: NormalizedConnectorMetric): ConnectorAirtableRecord {
    return {
      tableKey: metric.targetTableKey,
      uniqueKey: {
        fieldName: UNIQUE_KEY_FIELD,
        value: metric.uniqueKey
      },
      fields: removeUndefined({
        [UNIQUE_KEY_FIELD]: metric.uniqueKey,
        Source: metric.sourceName,
        Platform: metric.platform ?? metric.sourceName,
        Channel: metric.channel,
        Title: metric.contentTitle ?? metric.metricName,
        "Content Type": metric.contentType,
        Campaign: metric.campaign,
        Date: metric.date,
        KPI: metric.metricName,
        Metric: metric.metricName,
        Value: metric.value,
        Unit: metric.unit,
        "Activity Volume": metric.activityVolume,
        ...metricSpecificFields(metric)
      })
    };
  }
}

function metricSpecificFields(metric: NormalizedConnectorMetric): AirtableFields {
  const normalizedName = metric.metricName.toLowerCase();
  const fields: AirtableFields = {};

  if (normalizedName.includes("open")) {
    fields.Opens = metric.value;
  }
  if (normalizedName.includes("click")) {
    fields.Clicks = metric.value;
  }
  if (normalizedName.includes("stream")) {
    fields.Streams = metric.value;
  }
  if (normalizedName.includes("download")) {
    fields.Downloads = metric.value;
  }
  if (normalizedName.includes("listen")) {
    fields.Listeners = metric.value;
  }
  if (normalizedName.includes("view")) {
    fields.Views = metric.value;
  }
  if (normalizedName.includes("like")) {
    fields.Likes = metric.value;
  }
  if (normalizedName.includes("comment")) {
    fields.Comments = metric.value;
  }
  if (normalizedName.includes("share")) {
    fields.Shares = metric.value;
  }
  if (normalizedName.includes("visitor")) {
    fields.Views = metric.value;
  }

  return fields;
}

function removeUndefined(fields: AirtableFields): AirtableFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as AirtableFields;
}

function emptyWriteResult(dryRun: boolean): ConnectorWriteResult {
  return {
    attempted: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    dryRun
  };
}
