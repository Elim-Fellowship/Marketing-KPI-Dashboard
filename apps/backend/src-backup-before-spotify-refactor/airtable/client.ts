import { AppError } from "../errors.js";
import type { AppConfig } from "../config/env.js";
import type { Logger } from "../logging/logger.js";

export type AirtableFieldValue =
  | string
  | number
  | boolean
  | string[]
  | undefined
  | null;

export type AirtableFields = Record<string, AirtableFieldValue>;

export interface AirtableRecord<TFields extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  fields: TFields;
  createdTime?: string;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface AirtableWriteResponse {
  records: AirtableRecord[];
}

interface AirtableErrorBody {
  error?: {
    type?: string;
    message?: string;
  };
}

export interface FindRecordsOptions {
  filterByFormula?: string;
  maxRecords?: number;
  pageSize?: number;
  view?: string;
  fields?: string[];
  sort?: Array<{
    field: string;
    direction?: "asc" | "desc";
  }>;
}

export interface UpsertResult {
  record: AirtableRecord;
  created: boolean;
}

export class AirtableClient {
  private lastRequestAt = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {}

  async findRecords<TFields extends Record<string, unknown> = Record<string, unknown>>(
    tableName: string,
    options: FindRecordsOptions = {}
  ): Promise<Array<AirtableRecord<TFields>>> {
    const records: Array<AirtableRecord<TFields>> = [];
    let offset: string | undefined;

    do {
      const search = this.buildSearchParams(options, offset);
      const response = await this.request<AirtableListResponse>(tableName, `?${search.toString()}`, {
        method: "GET"
      });

      records.push(...(response.records as Array<AirtableRecord<TFields>>));
      offset = response.offset;
    } while (offset && (!options.maxRecords || records.length < options.maxRecords));

    return options.maxRecords ? records.slice(0, options.maxRecords) : records;
  }

  async findOneByField<TFields extends Record<string, unknown> = Record<string, unknown>>(
    tableName: string,
    fieldName: string,
    value: string
  ): Promise<AirtableRecord<TFields> | undefined> {
    const records = await this.findRecords<TFields>(tableName, {
      maxRecords: 1,
      filterByFormula: equalsFormula(fieldName, value)
    });

    return records[0];
  }

  async verifyTableFields(tableName: string, fields: readonly string[]): Promise<void> {
    await this.findRecords(tableName, {
      maxRecords: 1,
      pageSize: 1,
      fields: [...fields]
    });
  }

  async createRecord(tableName: string, fields: AirtableFields): Promise<AirtableRecord> {
    const response = await this.request<AirtableWriteResponse>(tableName, "", {
      method: "POST",
      body: JSON.stringify({
        records: [{ fields: removeEmptyValues(fields) }],
        typecast: true
      })
    });

    return response.records[0];
  }

  async updateRecord(
    tableName: string,
    recordId: string,
    fields: AirtableFields
  ): Promise<AirtableRecord> {
    const response = await this.request<AirtableWriteResponse>(tableName, "", {
      method: "PATCH",
      body: JSON.stringify({
        records: [{ id: recordId, fields: removeEmptyValues(fields) }],
        typecast: true
      })
    });

    return response.records[0];
  }

async upsertByUniqueKey(
  tableName: string,
  uniqueKeyField: string,
  uniqueKey: string,
  fields: AirtableFields
): Promise<UpsertResult> {

  console.log("===== AIRTABLE UPSERT =====");
  console.log("TABLE:", tableName);
  console.log("UNIQUE FIELD:", uniqueKeyField);
  console.log("UNIQUE KEY:", uniqueKey);
  console.log("FIELDS:", fields);
  console.log("===========================");

  const existing = await this.findOneByField(
    tableName,
    uniqueKeyField,
    uniqueKey
  );

if (existing) {
  const record = await this.updateRecord(tableName, existing.id, fields);
  return { record, created: false };
}

const record = await this.createRecord(tableName, fields);
return { record, created: true };
}

  private buildSearchParams(options: FindRecordsOptions, offset?: string): URLSearchParams {
    const search = new URLSearchParams();

    if (offset) {
      search.set("offset", offset);
    }

    if (options.maxRecords) {
      search.set("maxRecords", String(options.maxRecords));
    }

    if (options.pageSize) {
      search.set("pageSize", String(options.pageSize));
    }

    if (options.view) {
      search.set("view", options.view);
    }

    if (options.filterByFormula) {
      search.set("filterByFormula", options.filterByFormula);
    }

    for (const field of options.fields ?? []) {
      search.append("fields[]", field);
    }

    for (const [index, sort] of (options.sort ?? []).entries()) {
      search.append(`sort[${index}][field]`, sort.field);
      search.append(`sort[${index}][direction]`, sort.direction ?? "asc");
    }

    return search;
  }

  private async request<T>(
    tableName: string,
    pathAndQuery: string,
    init: RequestInit
  ): Promise<T> {
    await this.throttle();

    const { apiKey, baseId, apiBaseUrl } = this.config.airtable;
    const url = `${apiBaseUrl}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}${pathAndQuery}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {})
        }
      });
    } catch (error) {
      throw new AppError(
        "AIRTABLE_REQUEST_FAILED",
        `Could not reach Airtable for table ${tableName}. Check network access and Airtable availability.`,
        {
          tableName,
          cause: error instanceof Error ? error.message : String(error)
        }
      );
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.error("Airtable request failed", {
        tableName,
        status: response.status,
        body: body.slice(0, 700)
      });
      throw mapAirtableError(response.status, body, tableName);
    }

    return (await response.json()) as T;
  }

  private async throttle(): Promise<void> {
    const delayMs = this.config.airtable.rateLimitMs;
    if (delayMs <= 0) {
      return;
    }

    const elapsed = Date.now() - this.lastRequestAt;
    const remaining = delayMs - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    this.lastRequestAt = Date.now();
  }
}

export function equalsFormula(fieldName: string, value: string): string {
  return `{${fieldName}}="${escapeFormulaString(value)}"`;
}

export function escapeFormulaString(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"'); 
}

function mapAirtableError(status: number, body: string, tableName: string): AppError {
  const parsed = parseAirtableError(body);
  const type = parsed.error?.type ?? "UNKNOWN";
  const message = (parsed.error?.message ?? body.slice(0, 300)) || "Unknown Airtable error";
  const details = { tableName, status, airtableType: type, airtableMessage: message };
  const normalized = `${type} ${message}`.toLowerCase();

  if (status === 401 || status === 403 || normalized.includes("authentication")) {
    return new AppError(
      "AIRTABLE_AUTH",
      "Airtable authentication failed. Check AIRTABLE_PAT, token scopes, and base access.",
      details
    );
  }

  if (
    status === 404 ||
    normalized.includes("table") && normalized.includes("not found") ||
    normalized.includes("could not find table")
  ) {
    return new AppError(
      "MISSING_AIRTABLE_TABLE",
      `Airtable table not found: ${tableName}. Check the table name env vars.`,
      details
    );
  }

  if (
    normalized.includes("unknown field") ||
    normalized.includes("field") && normalized.includes("not found") ||
    normalized.includes("invalid field")
  ) {
    return new AppError(
      "MISSING_AIRTABLE_FIELD",
      `Airtable field is missing or misspelled in table ${tableName}: ${message}`,
      details
    );
  }

  if (
    normalized.includes("cannot accept") ||
    normalized.includes("invalid cell value") ||
    normalized.includes("invalid value") ||
    normalized.includes("field type") ||
    normalized.includes("typecast")
  ) {
    return new AppError(
      "WRONG_AIRTABLE_FIELD_TYPE",
      `Airtable rejected a value for table ${tableName}. Check editable field types and linked-record fields: ${message}`,
      details
    );
  }

  return new AppError(
    "AIRTABLE_REQUEST_FAILED",
    `Airtable request failed for table ${tableName}: ${message}`,
    details
  );
}

function parseAirtableError(body: string): AirtableErrorBody {
  try {
    return JSON.parse(body) as AirtableErrorBody;
  } catch {
    return {};
  }
}

function removeEmptyValues(fields: AirtableFields): Record<string, string | number | boolean | string[]> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number | boolean | string[]] => {
        const value = entry[1];
        if (value === undefined || value === null) {
          return false;
        }

        if (Array.isArray(value) && value.length === 0) {
          return false;
        }

        return true;
      }
    )
  );
}
