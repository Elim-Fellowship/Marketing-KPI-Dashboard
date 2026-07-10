import { AppError, isAppError } from "../errors.js";
import type { AirtableTableKey, NormalizedAirtableRecord } from "../types/airtableTables.js";
import type { AirtableService } from "./airtableService.js";

interface RequiredTableDefinition {
  key: AirtableTableKey;
  displayName: string;
  requiredFields: string[];
}

export interface TableHealth {
  tableKey: AirtableTableKey;
  tableName: string;
  available: boolean;
  recordCount: number;
  empty: boolean;
  requiredFields: string[];
  missingFields: string[];
  error?: {
    code: string;
    message: string;
  };
}

export interface DataHealthReport {
  airtableConnectionStatus: "Connected" | "Degraded" | "Unavailable";
  checkedAt: string;
  tables: TableHealth[];
  emptyTables: string[];
  missingFields: Record<string, string[]>;
}

const REQUIRED_TABLES: RequiredTableDefinition[] = [
  {
    key: "kpiHistory",
    displayName: "KPI_History",
    requiredFields: ["KPI", "Metric", "Value", "Date"]
  },
  {
    key: "contentPerformance",
    displayName: "Content_Performance",
    requiredFields: ["Title", "Platform", "Content Type", "Date"]
  },
  {
    key: "spotifyWeeklySnapshot",
    displayName: "Spotify_Weekly_Snapshot",
    requiredFields: ["Date", "Streams", "Listeners"]
  },
  {
    key: "dataSourceStatus",
    displayName: "Data_Source_Status",
    requiredFields: ["Source Name", "Connection Status", "Last Sync Time"]
  },
  {
    key: "channelPerformance",
    displayName: "Channel_Performance",
    requiredFields: [
      "Channel",
      "Date",
      "Activity Volume",
      "Metric Label",
      "Metric Value",
      "Previous Metric Value",
      "Change Percent"
    ]
  },
  {
    key: "monthlyActivitySummary",
    displayName: "Monthly_Activity_Summary",
    requiredFields: [
      "Date",
      "Emails Sent",
      "Podcasts Published",
      "Social Posts Published",
      "Website Articles Published",
      "Newsletter Editions Published"
    ]
  }
];

export class DataHealthService {
  constructor(private readonly airtable: AirtableService) {}

  async getDataHealth(): Promise<DataHealthReport> {
    const tables = await Promise.all(REQUIRED_TABLES.map((definition) => this.checkTable(definition)));
    const availableCount = tables.filter((table) => table.available).length;
    const airtableConnectionStatus =
      availableCount === tables.length ? "Connected" : availableCount > 0 ? "Degraded" : "Unavailable";

    return {
      airtableConnectionStatus,
      checkedAt: new Date().toISOString(),
      tables,
      emptyTables: tables.filter((table) => table.available && table.empty).map((table) => table.tableName),
      missingFields: Object.fromEntries(
        tables
          .filter((table) => table.missingFields.length > 0)
          .map((table) => [table.tableName, table.missingFields])
      )
    };
  }

  private async checkTable(definition: RequiredTableDefinition): Promise<TableHealth> {
    try {
      const records = await this.airtable.getRecords(definition.key, {
        maxRecords: 100
      });
      const missingFields = findMissingFields(records, definition.requiredFields);

      return {
        tableKey: definition.key,
        tableName: definition.displayName,
        available: true,
        recordCount: records.length,
        empty: records.length === 0,
        requiredFields: definition.requiredFields,
        missingFields
      };
    } catch (error) {
      return {
        tableKey: definition.key,
        tableName: definition.displayName,
        available: false,
        recordCount: 0,
        empty: true,
        requiredFields: definition.requiredFields,
        missingFields: definition.requiredFields,
        error: {
          code: isAppError(error) ? error.code : "UNKNOWN_ERROR",
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}

function findMissingFields(
  records: Array<NormalizedAirtableRecord<Record<string, unknown>>>,
  requiredFields: string[]
): string[] {
  if (!records.length) {
    return requiredFields;
  }

  const availableFields = new Set<string>();
  for (const record of records) {
    for (const fieldName of Object.keys(record.fields)) {
      availableFields.add(normalizeFieldName(fieldName));
    }
  }

  return requiredFields.filter((field) => !availableFields.has(normalizeFieldName(field)));
}

function normalizeFieldName(fieldName: string): string {
  return fieldName.trim().toLowerCase();
}
