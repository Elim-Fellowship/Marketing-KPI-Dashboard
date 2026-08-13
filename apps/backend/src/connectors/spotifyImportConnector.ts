import type { AirtableFields } from "../airtable/client.js";
import { AppError } from "../errors.js";
import { BaseConnector } from "./baseConnector.js";
import type { ConnectorAirtablePayload, ConnectorRunContext, ConnectorWriteResult, RawConnectorMetric } from "./types.js";

export class SpotifyImportConnector extends BaseConnector {
  readonly metadata = { id: "spotify" as const, name: "Spotify CSV Import", sourceName: "Spotify", description: "Imports Spotify podcast performance metrics from CSV files", category: "podcast" as const, mode: "manual" as const, enabled: true };

  override async authenticate(context: ConnectorRunContext) {
    return context.csv?.trim()
      ? { ok: true, status: "Connected" as const, message: "Spotify CSV ready." }
      : { ok: false, status: "Needs Setup" as const, message: "Choose a Spotify analytics CSV before importing." };
  }

  override async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    return parseSpotifyCsv(context.csv ?? "").map((row) => ({ sourceRecordId: key(row.episodeName, row.publishDate), metricName: "streams", value: row.totalStreams, unit: "streams", date: row.publishDate, targetTableKey: "spotifyEpisodeMetrics", platform: "Spotify", channel: "Spotify", contentTitle: row.episodeName, contentType: "Podcast Episode", activityVolume: 1, dimensions: { episodeName: row.episodeName, likes: row.likes ?? 0, downloads: row.downloads ?? 0 } }));
  }

  override async transformData(metrics: RawConnectorMetric[]): Promise<ConnectorAirtablePayload> {
    return { metrics: [], records: metrics.map((metric) => {
      const episodeName = String(metric.dimensions?.episodeName ?? metric.contentTitle ?? "").trim();
      const fields: AirtableFields = { "Episode Name": episodeName, "Publish Date": metric.date, "Total Streams": metric.value, Source: "spotify", "Import Date": new Date().toISOString().slice(0, 10) };
      const likes = positiveNumber(metric.dimensions?.likes); const downloads = positiveNumber(metric.dimensions?.downloads);
      if (likes !== undefined) fields.Likes = likes; if (downloads !== undefined) fields.Downloads = downloads;
      return { tableKey: "spotifyEpisodeMetrics" as const, uniqueKey: { fieldName: "Episode Name", value: key(episodeName, metric.date) }, fields };
    }) };
  }

  override async writeToAirtable(payload: ConnectorAirtablePayload, context: ConnectorRunContext): Promise<ConnectorWriteResult> {
    const tableName = context.config.airtable.tables.spotifyEpisodeMetrics;
    const existing = await context.airtable.findRecords(tableName, { maxRecords: 1000 });
    const byKey = new Map<string, (typeof existing)[number]>();
    for (const record of existing) { const name = String(record.fields["Episode Name"] ?? "").trim(); const date = normalizeDate(String(record.fields["Publish Date"] ?? "")); if (name && date && !byKey.has(key(name, date))) byKey.set(key(name, date), record); }
    let created = 0; let updated = 0; let skipped = 0;
    for (const record of payload.records) {
      const name = String(record.fields["Episode Name"] ?? "").trim(); const date = normalizeDate(String(record.fields["Publish Date"] ?? "")); const recordKey = key(name, date ?? ""); const current = byKey.get(recordKey);
      if (current && fieldsMatch(current.fields, record.fields)) { skipped += 1; continue; }
      if (context.dryRun) { skipped += 1; continue; }
      if (current) { const saved = await context.airtable.updateRecord(tableName, current.id, record.fields); byKey.set(recordKey, saved); updated += 1; }
      else { const saved = await context.airtable.createRecord(tableName, record.fields); byKey.set(recordKey, saved); created += 1; }
    }
    return { attempted: payload.records.length, created, updated, skipped, dryRun: context.dryRun };
  }

  protected async getMockMetrics(): Promise<RawConnectorMetric[]> { return []; }
}

type SpotifyRow = { episodeName: string; publishDate: string; totalStreams: number; likes?: number; downloads?: number };

function parseSpotifyCsv(csv: string): SpotifyRow[] {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) throw new AppError("VALIDATION_FAILED", "The Spotify CSV is empty.");
  const headers = rows[0].map(normalizeHeader);
  const episode = find(headers, ["episode name", "episode", "episode title", "title", "name"]); const date = find(headers, ["publish date", "published", "published date", "release date", "date"]); const streams = find(headers, ["total streams", "streams", "plays", "spotify plays", "starts"]);
  const recognized = episode >= 0 || date >= 0 || streams >= 0;
  if (recognized && (episode < 0 || date < 0 || streams < 0)) throw new AppError("VALIDATION_FAILED", "Spotify CSV needs episode name, publish date, and streams/plays columns.", { headers: rows[0] });
  const indexes = recognized ? { episode, date, streams, likes: find(headers, ["likes", "total likes"]), downloads: find(headers, ["downloads", "total downloads"]) } : { episode: 0, streams: 1, date: 2, likes: -1, downloads: -1 };
  const data = recognized ? rows.slice(1) : rows; const parsed: SpotifyRow[] = []; const errors: string[] = [];
  data.forEach((row, index) => { const line = index + (recognized ? 2 : 1); const episodeName = String(row[indexes.episode] ?? "").trim(); const publishDate = normalizeDate(String(row[indexes.date] ?? "")); const totalStreams = parseNumber(row[indexes.streams]); if (!episodeName && !publishDate && totalStreams === undefined) return; if (!episodeName) errors.push(`Row ${line}: missing episode name`); if (!publishDate) errors.push(`Row ${line}: invalid publish date`); if (totalStreams === undefined) errors.push(`Row ${line}: invalid streams/plays value`); if (episodeName && publishDate && totalStreams !== undefined) parsed.push({ episodeName, publishDate, totalStreams, likes: indexes.likes >= 0 ? parseNumber(row[indexes.likes]) : undefined, downloads: indexes.downloads >= 0 ? parseNumber(row[indexes.downloads]) : undefined }); });
  if (errors.length) throw new AppError("VALIDATION_FAILED", `Spotify CSV contains ${errors.length} invalid row${errors.length === 1 ? "" : "s"}.`, { errors: errors.slice(0, 20) });
  if (!parsed.length) throw new AppError("VALIDATION_FAILED", "No valid Spotify episode rows were found in the CSV.");
  const unique = new Map<string, SpotifyRow>(); for (const row of parsed) unique.set(key(row.episodeName, row.publishDate), row); return [...unique.values()];
}

function parseCsv(csv: string): string[][] { const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; for (let i = 0; i < csv.length; i += 1) { const c = csv[i]; const n = csv[i + 1]; if (c === '"') { if (quoted && n === '"') { cell += '"'; i += 1; } else quoted = !quoted; } else if (c === "," && !quoted) { row.push(cell); cell = ""; } else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && n === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c; } if (cell.length || row.length) { row.push(cell); rows.push(row); } return rows; }
function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function find(headers: string[], aliases: string[]) { return headers.findIndex((header) => aliases.includes(header)); }
function parseNumber(value: unknown): number | undefined { const text = String(value ?? "").trim().replace(/,/g, ""); if (!text) return undefined; const parsed = Number(text.replace(/%$/, "")); return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined; }
function positiveNumber(value: unknown): number | undefined { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; }
function normalizeDate(value: string): string | undefined { const text = value.trim(); if (!text) return undefined; const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text); if (iso) return dateParts(Number(iso[1]), Number(iso[2]), Number(iso[3])); const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text); if (us) return dateParts(Number(us[3]), Number(us[1]), Number(us[2])); const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10); }
function dateParts(year: number, month: number, day: number): string | undefined { const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : undefined; }
function key(name: string, date: string) { return `${name.trim().toLowerCase().replace(/\s+/g, " ")}|${date}`; }
function num(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function fieldsMatch(existing: Record<string, unknown>, incoming: AirtableFields) { return key(String(existing["Episode Name"] ?? ""), normalizeDate(String(existing["Publish Date"] ?? "")) ?? "") === key(String(incoming["Episode Name"] ?? ""), normalizeDate(String(incoming["Publish Date"] ?? "")) ?? "") && num(existing["Total Streams"]) === num(incoming["Total Streams"]) && num(existing.Likes) === num(incoming.Likes) && num(existing.Downloads) === num(incoming.Downloads); }
