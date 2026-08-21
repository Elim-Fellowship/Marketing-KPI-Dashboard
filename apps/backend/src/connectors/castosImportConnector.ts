import type { AirtableFields } from "../airtable/client.js";
import { AppError } from "../errors.js";
import { BaseConnector } from "./baseConnector.js";
import type { ConnectorAirtablePayload, ConnectorRunContext, ConnectorWriteResult, RawConnectorMetric } from "./types.js";

export class CastosImportConnector extends BaseConnector {
  readonly metadata = {
    id: "castos-import" as const,
    name: "Castos CSV Import",
    sourceName: "Castos",
    description: "Imports monthly Castos listens analytics exports",
    category: "podcast" as const,
    mode: "manual" as const,
    enabled: true
  };

  override async authenticate(context: ConnectorRunContext) {
    return context.csv?.trim()
      ? { ok: true, status: "Connected" as const, message: "Castos listens export ready." }
      : { ok: false, status: "Needs Setup" as const, message: "Choose the Castos Listens CSV before importing." };
  }

  override async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const bundle = parseBundle(context.csv ?? "");
    if (bundle.files.length !== 1) {
      throw new AppError("VALIDATION_FAILED", "Upload exactly one Castos Listens CSV export at a time.");
    }

    const file = bundle.files[0];
    if (detectType(file.csv) !== "listens") {
      throw new AppError("VALIDATION_FAILED", "The selected file is not a Castos Listens export. Expected columns: Published Date, Podcast, Episode, Listens.");
    }

    const range = parseFilenameRange(file.name);
    if (!range) {
      throw new AppError("VALIDATION_FAILED", "Could not determine the Castos reporting period from the filename. Download the report directly from Castos and do not rename it before importing.");
    }
    if (!isFullCalendarMonth(range)) {
      throw new AppError("VALIDATION_FAILED", `Castos imports must cover one complete calendar month. This file covers ${range.start} to ${range.end}. Export the Listens CSV for the first through last day of one month.`);
    }

    const rows = parseListens(file.csv);
    const totalListens = rows.reduce((sum, row) => sum + row.listens, 0);

    return [{
      sourceRecordId: `castos:listens:${range.start}:${range.end}`,
      metricName: "castos_listens",
      value: totalListens,
      unit: "count",
      date: range.end,
      targetTableKey: "kpiHistory",
      platform: "Castos",
      channel: "Podcast",
      activityVolume: totalListens,
      dimensions: {
        periodStart: range.start,
        periodEnd: range.end,
        periodType: "monthly",
        rowCount: rows.length
      }
    }];
  }

  override async transformData(metrics: RawConnectorMetric[]): Promise<ConnectorAirtablePayload> {
    return {
      metrics: [],
      records: metrics.map((metricRow) => {
        const periodStart = String(metricRow.dimensions?.periodStart ?? metricRow.date);
        const periodEnd = String(metricRow.dimensions?.periodEnd ?? metricRow.date);
        const uniqueKey = `castos|${metricRow.metricName}|${periodStart}|${periodEnd}`;
        const fields: AirtableFields = {
          "Unique Key": uniqueKey,
          Metric: "Podcast Listens",
          "Metric Key": metricRow.metricName,
          Value: metricRow.value,
          Unit: metricRow.unit,
          "Period Type": "monthly",
          Date: periodEnd,
          "Snapshot Date": periodEnd,
          "Period Start": periodStart,
          "Period End": periodEnd,
          "Reporting Month": reportingMonth(periodEnd),
          Channel: "Podcast",
          Platform: "Castos",
          "Source Name": "Castos",
          "Aggregation Method": "reported",
          "Quality Status": "Complete",
          "Source Record ID": metricRow.sourceRecordId,
          "Last Synced At": new Date().toISOString()
        };
        return { tableKey: "kpiHistory" as const, uniqueKey: { fieldName: "Unique Key", value: uniqueKey }, fields };
      })
    };
  }

  override async writeToAirtable(payload: ConnectorAirtablePayload, context: ConnectorRunContext): Promise<ConnectorWriteResult> {
    const tableName = context.config.airtable.tables.kpiHistory;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of payload.records) {
      const uniqueKey = String(record.fields["Unique Key"] ?? "");
      const current = await context.airtable.findOneByField(tableName, "Unique Key", uniqueKey);
      if (current && fieldsMatch(current.fields, record.fields)) {
        skipped += 1;
        continue;
      }
      if (context.dryRun) {
        skipped += 1;
        continue;
      }
      if (current) {
        await context.airtable.updateRecord(tableName, current.id, record.fields);
        updated += 1;
      } else {
        await context.airtable.createRecord(tableName, record.fields);
        created += 1;
      }
    }

    return { attempted: payload.records.length, created, updated, skipped, dryRun: context.dryRun };
  }

  protected async getMockMetrics(): Promise<RawConnectorMetric[]> { return []; }
}

type FileBundle = { files: Array<{ name: string; csv: string }> };
type DateRange = { start: string; end: string };

function parseBundle(value: string): FileBundle {
  try {
    const parsed = JSON.parse(value) as FileBundle;
    if (Array.isArray(parsed.files) && parsed.files.length) {
      return { files: parsed.files.filter((file) => typeof file?.name === "string" && typeof file?.csv === "string") };
    }
  } catch { /* legacy single-file input handled below */ }
  return { files: [{ name: "castos.csv", csv: value }] };
}

function detectType(csv: string): "listens" | "unknown" {
  const header = parseCsv(csv)[0]?.map(normalizeHeader) ?? [];
  return ["published date", "podcast", "episode", "listens"].every((column) => header.includes(column)) ? "listens" : "unknown";
}

function parseListens(csv: string) {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  const headers = rows[0]?.map(normalizeHeader) ?? [];
  const indexes = {
    publishedDate: find(headers, ["published date"]),
    podcast: find(headers, ["podcast"]),
    episode: find(headers, ["episode"]),
    listens: find(headers, ["listens"])
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new AppError("VALIDATION_FAILED", "The Castos Listens export does not have the expected columns.");
  }

  const parsed = rows.slice(1).map((row, index) => ({
    publishedDate: requireDate(row[indexes.publishedDate], index + 2),
    podcast: String(row[indexes.podcast] ?? "").trim(),
    episode: String(row[indexes.episode] ?? "").trim(),
    listens: requireNumber(row[indexes.listens], index + 2)
  }));

  if (!parsed.length) throw new AppError("VALIDATION_FAILED", "The Castos Listens export contains no data rows.");
  if (parsed.some((row) => !row.podcast || !row.episode)) {
    throw new AppError("VALIDATION_FAILED", "The Castos Listens export contains a row with a missing podcast or episode name.");
  }
  return parsed;
}

function parseFilenameRange(name: string): DateRange | undefined {
  const match = /castos-listens-(\d{4})-(\d{2})-(\d{2})-to-(\d{4})-(\d{2})-(\d{2})(?:-[^.]+)?\.csv$/i.exec(name);
  if (!match) return undefined;
  const start = dateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  const end = dateParts(Number(match[4]), Number(match[5]), Number(match[6]));
  return start && end ? { start, end } : undefined;
}

function isFullCalendarMonth(range: DateRange): boolean {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(range.start);
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(range.end);
  if (!startMatch || !endMatch) return false;
  if (startMatch[1] !== endMatch[1] || startMatch[2] !== endMatch[2] || startMatch[3] !== "01") return false;
  const year = Number(startMatch[1]);
  const month = Number(startMatch[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number(endMatch[3]) === lastDay;
}

function reportingMonth(date: string) {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  return match ? `${match[1]}-${match[2]}` : "";
}

function fieldsMatch(existing: Record<string, unknown>, incoming: AirtableFields) {
  return ["Metric Key", "Value", "Unit", "Date", "Snapshot Date", "Period Start", "Period End", "Source Record ID"]
    .every((field) => String(existing[field] ?? "") === String(incoming[field] ?? ""));
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const character = csv[i];
    const next = csv[i + 1];
    if (character === '"') {
      if (quoted && next === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function find(headers: string[], aliases: string[]) { return headers.findIndex((header) => aliases.includes(header)); }
function requireNumber(value: unknown, line: number) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  const parsed = Number(text);
  if (!text || !Number.isFinite(parsed) || parsed < 0) throw new AppError("VALIDATION_FAILED", `Castos CSV row ${line} contains an invalid listens value.`);
  return parsed;
}
function requireDate(value: unknown, line: number) {
  const date = normalizeDate(String(value ?? ""));
  if (!date) throw new AppError("VALIDATION_FAILED", `Castos CSV row ${line} contains an invalid published date.`);
  return date;
}
function normalizeDate(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return dateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return dateParts(Number(us[3]), Number(us[1]), Number(us[2]));
  return undefined;
}
function dateParts(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined;
}
