import { randomUUID } from "node:crypto";

import type { AirtableClient, AirtableRecord } from "../airtable/client.js";
import { FIELDS, REQUIRED_FIELDS } from "../config/airtableSchema.js";
import type { AppConfig } from "../config/env.js";
import { AppError, toPublicError } from "../errors.js";
import { getConnector } from "../connectors/index.js";
import type { Logger } from "../logging/logger.js";
import { serializeError } from "../logging/logger.js";
import type {
  ImportJobStatus,
  NormalizedKpiValue,
  PlaceholderKpiValue,
  SyncResult
} from "../types/kpi.js";

interface LinkRecords {
  sourceRecord: AirtableRecord;
  kpiRecord: AirtableRecord;
}

export class KpiSyncService {
  constructor(
    private readonly config: AppConfig,
    private readonly airtable: AirtableClient,
    private readonly logger: Logger
  ) {}

  async verifyAirtableSetup(): Promise<void> {
    const tables = this.config.airtable.tables;
    await this.airtable.verifyTableFields(tables.kpiSources, REQUIRED_FIELDS.kpiSources);
    await this.airtable.verifyTableFields(tables.kpis, REQUIRED_FIELDS.kpis);
    await this.airtable.verifyTableFields(tables.kpiRecords, REQUIRED_FIELDS.kpiRecords);
    await this.airtable.verifyTableFields(tables.importJobs, REQUIRED_FIELDS.importJobs);
  }

  async runSync(): Promise<SyncResult> {
    await this.verifyAirtableSetup();

    const startedAt = new Date().toISOString();
    const jobId = randomUUID();
    const jobRecord = await this.createImportJob(jobId, startedAt);
    const errors: SyncResult["errors"] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsFailed = 0;

    try {
      this.logger.info("Starting KPI sync", { jobId });
      const connector = getConnector();
      const values = await connector.collect();

      for (const value of values.map(normalizeKpiValue)) {
        try {
          const links = await this.findLinkedRecords(value);
          const result = await this.upsertKpiRecord(value, jobRecord.id, links);
          if (result.created) {
            recordsCreated += 1;
          } else {
            recordsUpdated += 1;
          }
        } catch (error) {
          recordsFailed += 1;
          const publicError = toPublicError(error);
          errors.push({
            ...publicError,
            message: `${value.uniqueKey}: ${publicError.message}`
          });
          this.logger.error("Failed to sync KPI record", {
            uniqueKey: value.uniqueKey,
            error: serializeError(error)
          });
        }
      }

      const status: ImportJobStatus = errors.length === 0 ? "Success" : "Failed";
      await this.finishImportJob(jobRecord.id, status, {
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errors
      });

      this.logger.info("KPI sync finished", {
        jobId,
        status,
        recordsCreated,
        recordsUpdated,
        recordsFailed
      });

      return {
        jobId,
        jobRecordId: jobRecord.id,
        status,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        recordsProcessed: recordsCreated + recordsUpdated + recordsFailed,
        errors
      };
    } catch (error) {
      const publicError = toPublicError(error);
      errors.push(publicError);

      await this.finishImportJob(jobRecord.id, "Failed", {
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errors
      });

      this.logger.error("KPI sync failed", {
        jobId,
        error: serializeError(error)
      });

      return {
        jobId,
        jobRecordId: jobRecord.id,
        status: "Failed",
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        recordsProcessed: recordsCreated + recordsUpdated + recordsFailed,
        errors
      };
    }
  }

  private async createImportJob(jobId: string, startedAt: string): Promise<AirtableRecord> {
    return this.airtable.createRecord(this.config.airtable.tables.importJobs, {
      [FIELDS.jobs.name]: `KPI Sync ${startedAt}`,
      [FIELDS.jobs.jobId]: jobId,
      [FIELDS.jobs.status]: "Running",
      [FIELDS.jobs.startedAt]: startedAt,
      [FIELDS.jobs.recordsCreated]: 0,
      [FIELDS.jobs.recordsUpdated]: 0,
      [FIELDS.jobs.recordsFailed]: 0
    });
  }

  private async finishImportJob(
    jobRecordId: string,
    status: ImportJobStatus,
    counts: {
      recordsCreated: number;
      recordsUpdated: number;
      recordsFailed: number;
      errors: SyncResult["errors"];
    }
  ): Promise<void> {
    await this.airtable.updateRecord(this.config.airtable.tables.importJobs, jobRecordId, {
      [FIELDS.jobs.status]: status,
      [FIELDS.jobs.finishedAt]: new Date().toISOString(),
      [FIELDS.jobs.recordsCreated]: counts.recordsCreated,
      [FIELDS.jobs.recordsUpdated]: counts.recordsUpdated,
      [FIELDS.jobs.recordsFailed]: counts.recordsFailed,
      [FIELDS.jobs.errorMessage]:
        counts.errors.length > 0
          ? counts.errors.map((error) => `${error.code}: ${error.message}`).join("\n")
          : ""
    });
  }

  private async findLinkedRecords(value: NormalizedKpiValue): Promise<LinkRecords> {
    const sourceRecord = await this.airtable.findOneByField(
      this.config.airtable.tables.kpiSources,
      FIELDS.sources.key,
      value.sourceKey
    );

    if (!sourceRecord) {
      throw new AppError(
        "MISSING_LINKED_RECORD",
        `No KPI Sources record found where ${FIELDS.sources.key} is "${value.sourceKey}". Create that source before syncing.`,
        {
          tableName: this.config.airtable.tables.kpiSources,
          fieldName: FIELDS.sources.key,
          value: value.sourceKey
        }
      );
    }

    const kpiRecord = await this.airtable.findOneByField(
      this.config.airtable.tables.kpis,
      FIELDS.kpis.key,
      value.kpiKey
    );

    if (!kpiRecord) {
      throw new AppError(
        "MISSING_LINKED_RECORD",
        `No KPIs record found where ${FIELDS.kpis.key} is "${value.kpiKey}". Create that KPI before syncing.`,
        {
          tableName: this.config.airtable.tables.kpis,
          fieldName: FIELDS.kpis.key,
          value: value.kpiKey
        }
      );
    }

    return { sourceRecord, kpiRecord };
  }

  private async upsertKpiRecord(
    value: NormalizedKpiValue,
    importJobRecordId: string,
    links: LinkRecords
  ): Promise<{ created: boolean }> {
    const result = await this.airtable.upsertByUniqueKey(
      this.config.airtable.tables.kpiRecords,
      FIELDS.records.uniqueKey,
      value.uniqueKey,
      {
        [FIELDS.records.uniqueKey]: value.uniqueKey,
        [FIELDS.records.kpi]: [links.kpiRecord.id],
        [FIELDS.records.source]: [links.sourceRecord.id],
        [FIELDS.records.importJob]: [importJobRecordId],
        [FIELDS.records.reportingDate]: value.reportingDate,
        [FIELDS.records.periodType]: value.periodType,
        [FIELDS.records.value]: value.value,
        [FIELDS.records.unit]: value.unit,
        [FIELDS.records.rawJson]: JSON.stringify(value.rawData ?? {}, null, 2)
      }
    );

    return { created: result.created };
  }
}

function normalizeKpiValue(value: PlaceholderKpiValue): NormalizedKpiValue {
  const reportingDate = normalizeReportingDate(value.reportingDate);
  const normalized: PlaceholderKpiValue = {
    ...value,
    sourceKey: required(value.sourceKey, "sourceKey"),
    kpiKey: required(value.kpiKey, "kpiKey"),
    kpiName: required(value.kpiName, "kpiName"),
    unit: required(value.unit, "unit"),
    reportingDate,
    value: Number(value.value)
  };

  if (!Number.isFinite(normalized.value)) {
    throw new AppError(
      "VALIDATION_FAILED",
      `KPI ${normalized.kpiKey} has a non-numeric value`,
      { kpiKey: normalized.kpiKey }
    );
  }

  return {
    ...normalized,
    uniqueKey: buildKpiRecordUniqueKey(normalized.kpiKey, reportingDate, normalized.periodType)
  };
}

export function buildKpiRecordUniqueKey(
  kpiKey: string,
  reportingDate: string,
  periodType: string
): string {
  return `${kpiKey.trim().toLowerCase()}__${reportingDate}__${periodType.trim().toLowerCase()}`;
}

function normalizeReportingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Invalid reportingDate: ${value}`,
      { reportingDate: value }
    );
  }

  return date.toISOString().slice(0, 10);
}

function required(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError("VALIDATION_FAILED", `Missing ${fieldName}`, { fieldName });
  }

  return normalized;
}
