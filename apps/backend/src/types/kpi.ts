export type PeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface PlaceholderKpiValue {
  sourceKey: string;
  kpiKey: string;
  kpiName: string;
  value: number;
  unit: string;
  reportingDate: string;
  periodType: PeriodType;
  rawData?: unknown;
}

export interface NormalizedKpiValue extends PlaceholderKpiValue {
  uniqueKey: string;
}

export interface KpiConnector {
  id: string;
  name: string;
  collect(): Promise<PlaceholderKpiValue[]>;
}

export type ImportJobStatus = "Running" | "Success" | "Failed";

export interface SyncResult {
  jobId: string;
  jobRecordId: string;
  status: ImportJobStatus;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  recordsProcessed: number;
  errors: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
