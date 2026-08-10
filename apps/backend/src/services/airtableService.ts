import type { AirtableClient, AirtableRecord, FindRecordsOptions } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import type {
  AirtableTableKey,
  AirtableTableRecordMap,
  NormalizedAirtableRecord
} from "../types/airtableTables.js";

type RequestedAirtableTableKey = Exclude<AirtableTableKey, "dataSourceStatus">;
type CommunicationsTableKey =
  | "spotifyWeeklySnapshot"
  | "bufferPostMetrics"
  | "contentPerformance"
  | "kpiHistory"
  | "dataSourceStatus"
  | "channelPerformance"
  | "monthlyActivitySummary";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class AirtableService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly config: AppConfig,
    private readonly airtable: AirtableClient
  ) {}

  async getRecords<TKey extends AirtableTableKey>(
    tableKey: TKey,
    options: FindRecordsOptions = {}
  ): Promise<Array<NormalizedAirtableRecord<AirtableTableRecordMap[TKey]>>> {
    const cacheKey = `${tableKey}:${JSON.stringify(options)}`;
    const cached = this.getCached<Array<NormalizedAirtableRecord<AirtableTableRecordMap[TKey]>>>(cacheKey);
    if (cached) {
      return cached;
    }

    const tableName = this.resolveTableName(tableKey);
    const records = await this.airtable.findRecords<AirtableTableRecordMap[TKey]>(tableName, options);
    let normalized = records.map(normalizeRecord);

    if (tableKey === "channelPerformance") {
      const bufferTableName = this.resolveTableName("bufferPostMetrics");
      const bufferRecords = await this.airtable.findRecords<Record<string, unknown>>(bufferTableName, {
        maxRecords: 1000
      });
      const bufferChannelRows = bufferRecords
        .map(normalizeRecord)
        .filter(isBufferSocialReactionMetric)
        .map(toChannelPerformanceRecord);

      normalized = [
        ...normalized,
        ...bufferChannelRows
      ] as Array<NormalizedAirtableRecord<AirtableTableRecordMap[TKey]>>;
    }

    this.setCached(cacheKey, normalized);
    return normalized;
  }

  async getAllRequestedTables(): Promise<Record<RequestedAirtableTableKey, Array<NormalizedAirtableRecord<Record<string, unknown>>>>> {
    const keys: RequestedAirtableTableKey[] = [
      "kpiSources",
      "kpis",
      "kpiRecords",
      "dashboardViews",
      "alerts",
      "spotifyWeeklySnapshot",
      "spotifyEpisodeMetrics",
      "contentPerformance",
      "kpiHistory",
      "channelPerformance",
      "monthlyActivitySummary"
    ];

    const entries = await Promise.all(
      keys.map(async (key) => [key, await this.getRecords(key)] as const)
    );

    return Object.fromEntries(entries) as Record<
      RequestedAirtableTableKey,
      Array<NormalizedAirtableRecord<Record<string, unknown>>>
    >;
  }

  async getCommunicationsTables(): Promise<Record<CommunicationsTableKey, Array<NormalizedAirtableRecord<Record<string, unknown>>>>> {
    const keys: CommunicationsTableKey[] = [
      "spotifyWeeklySnapshot",
      "bufferPostMetrics",
      "contentPerformance",
      "kpiHistory",
      "dataSourceStatus",
      "channelPerformance",
      "monthlyActivitySummary"
    ];

    const entries = await Promise.all(
      keys.map(async (key) => [key, await this.getRecords(key)] as const)
    );

    return Object.fromEntries(entries) as Record<
      CommunicationsTableKey,
      Array<NormalizedAirtableRecord<Record<string, unknown>>>
    >;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private resolveTableName(tableKey: AirtableTableKey): string {
    const tableMap = this.config.airtable.tables;
    const tableName = tableMap[tableKey];

    if (!tableName) {
      throw new Error(`Missing Airtable table mapping for: ${tableKey}`);
    }

    return tableName;
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  private setCached<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.airtable.cacheTtlMs
    });
  }
}

function normalizeRecord<TFields extends Record<string, unknown>>(
  record: AirtableRecord<TFields>
): NormalizedAirtableRecord<TFields> {
  return {
    id: record.id,
    createdTime: record.createdTime,
    fields: record.fields
  };
}

function isBufferSocialReactionMetric(
  record: NormalizedAirtableRecord<Record<string, unknown>>
): boolean {
  const metricName = String(record.fields["Metric Name"] ?? "").trim().toLowerCase();
  const channel = String(record.fields.Channel ?? "").trim().toLowerCase();
  const isSocialChannel = channel === "instagram" || channel === "facebook";
  const isReactionMetric = metricName === "reaction" || metricName === "reactions";
  const isLegacyLikeMetric = metricName === "like" || metricName === "likes";

  return isSocialChannel && (isReactionMetric || isLegacyLikeMetric);
}

function toChannelPerformanceRecord(
  record: NormalizedAirtableRecord<Record<string, unknown>>
): NormalizedAirtableRecord<Record<string, unknown>> {
  const fields = record.fields;
  const channel = String(fields.Channel ?? "").trim();
  const metricName = String(fields["Metric Name"] ?? "Reactions").trim() || "Reactions";

  return {
    id: `buffer:${record.id}`,
    createdTime: record.createdTime,
    fields: {
      Source: "Buffer",
      Platform: channel || fields.Platform || "Buffer",
      Channel: channel,
      Name: fields["Content Title"] ?? metricName,
      "Content Title": fields["Content Title"],
      Metric: metricName,
      "Metric Label": metricName,
      "Metric Value": fields["Metric Value"],
      Date: fields["Metric Date"],
      "Activity Volume": fields["Activity Volume"] ?? 1,
      "Source Record ID": fields["Source Record ID"]
    }
  };
}
