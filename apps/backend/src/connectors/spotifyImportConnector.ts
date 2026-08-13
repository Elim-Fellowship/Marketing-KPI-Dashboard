import type { AirtableFields } from "../airtable/client.js";
import { AppError } from "../errors.js";
import { BaseConnector } from "./baseConnector.js";
import type { ConnectorAirtablePayload, ConnectorRunContext, ConnectorWriteResult, RawConnectorMetric } from "./types.js";

export class SpotifyImportConnector extends BaseConnector {
  readonly metadata = { id: "spotify" as const, name: "Spotify CSV Import", sourceName: "Spotify", description: "Imports paired Spotify for Creators analytics exports", category: "podcast" as const, mode: "manual" as const, enabled: true };

  override async authenticate(context: ConnectorRunContext) {
    return context.csv?.trim() ? { ok: true, status: "Connected" as const, message: "Spotify export bundle ready." } : { ok: false, status: "Needs Setup" as const, message: "Choose the Spotify analytics exports before importing." };
  }

  override async fetchMetrics(context: ConnectorRunContext): Promise<RawConnectorMetric[]> {
    const bundle = parseBundle(context.csv ?? "");
    const engagement = bundle.files.find((file) => detectType(file.csv) === "engagement");
    const topEpisodes = bundle.files.find((file) => detectType(file.csv) === "topEpisodes");
    if (!engagement || !topEpisodes) {
      const missing = [!engagement ? "Engagement" : "", !topEpisodes ? "Top Episodes by Consumption Time" : ""].filter(Boolean);
      throw new AppError("VALIDATION_FAILED", `Missing required Spotify export${missing.length === 1 ? "" : "s"}: ${missing.join(" and ")}. Upload both files for the same reporting period.`);
    }

    const engagementRows = parseEngagement(engagement.csv);
    const engagementRange = { start: engagementRows[0].date, end: engagementRows[engagementRows.length - 1].date };
    const topRange = parseFilenameRange(topEpisodes.name);
    if (topRange && (topRange.start !== engagementRange.start || topRange.end !== engagementRange.end)) {
      throw new AppError("VALIDATION_FAILED", `The Spotify exports cover different reporting periods. Engagement is ${engagementRange.start} to ${engagementRange.end}; Top Episodes is ${topRange.start} to ${topRange.end}.`);
    }
    const reportRange = topRange ?? engagementRange;
    const metrics: RawConnectorMetric[] = [];

    for (const row of engagementRows) {
      metrics.push(metric("spotify_consumption_hours", row.consumptionHours, "hours", row.date, `engagement:${row.date}:consumption`, reportRange, { periodType: "daily" }));
      metrics.push(metric("spotify_average_consumption_hours", row.averageConsumptionHours, "hours", row.date, `engagement:${row.date}:average`, reportRange, { periodType: "daily" }));
      metrics.push(metric("spotify_comments", row.comments, "comments", row.date, `engagement:${row.date}:comments`, reportRange, { periodType: "daily" }));
      metrics.push(metric("spotify_followers", row.followers, "followers", row.date, `engagement:${row.date}:followers`, reportRange, { periodType: "daily" }));
    }

    for (const row of parseTopEpisodes(topEpisodes.csv)) {
      metrics.push(metric("spotify_episode_consumption_hours", row.consumptionHours, "hours", reportRange.end, row.episodeUri, reportRange, { periodType: "monthly", episodeTitle: row.episodeTitle, publishDate: row.publishDate, activityVolume: 1 }));
    }
    return metrics;
  }

  override async transformData(metrics: RawConnectorMetric[]): Promise<ConnectorAirtablePayload> {
    return {
      metrics: [],
      records: metrics.map((metricRow) => {
        const periodStart = String(metricRow.dimensions?.periodStart ?? metricRow.date);
        const periodEnd = String(metricRow.dimensions?.periodEnd ?? metricRow.date);
        const periodType = String(metricRow.dimensions?.periodType ?? "daily");
        const episodeTitle = String(metricRow.dimensions?.episodeTitle ?? "").trim();
        const publishDate = String(metricRow.dimensions?.publishDate ?? "").trim();
        const uniqueKey = `spotify|${metricRow.metricName}|${metricRow.sourceRecordId}|${periodStart}|${periodEnd}`;
        const fields: AirtableFields = {
          "Unique Key": uniqueKey,
          Metric: episodeTitle ? `Episode Consumption - ${episodeTitle}` : metricLabel(metricRow.metricName),
          "Metric Key": metricRow.metricName,
          Value: metricRow.value,
          Unit: metricRow.unit,
          "Period Type": periodType,
          Date: metricRow.date,
          "Snapshot Date": periodEnd,
          "Period Start": periodStart,
          "Period End": periodEnd,
          "Reporting Month": reportingMonth(periodEnd),
          Channel: "Podcast",
          Platform: "Spotify",
          "Source Name": "Spotify",
          "Aggregation Method": "reported",
          "Quality Status": "Complete",
          "Source Record ID": publishDate ? `${metricRow.sourceRecordId}|published:${publishDate}` : metricRow.sourceRecordId,
          "Last Synced At": new Date().toISOString()
        };
        return { tableKey: "kpiHistory" as const, uniqueKey: { fieldName: "Unique Key", value: uniqueKey }, fields };
      })
    };
  }

  override async writeToAirtable(payload: ConnectorAirtablePayload, context: ConnectorRunContext): Promise<ConnectorWriteResult> {
    const tableName = context.config.airtable.tables.kpiHistory;
    const existing = await context.airtable.findRecords(tableName, { maxRecords: 1000 });
    const byKey = new Map(existing.map((record) => [String(record.fields["Unique Key"] ?? ""), record]));
    let created = 0; let updated = 0; let skipped = 0;
    for (const record of payload.records) {
      const uniqueKey = String(record.fields["Unique Key"] ?? "");
      const current = byKey.get(uniqueKey);
      if (current && fieldsMatch(current.fields, record.fields)) { skipped += 1; continue; }
      if (context.dryRun) { skipped += 1; continue; }
      if (current) { const saved = await context.airtable.updateRecord(tableName, current.id, record.fields); byKey.set(uniqueKey, saved); updated += 1; }
      else { const saved = await context.airtable.createRecord(tableName, record.fields); byKey.set(uniqueKey, saved); created += 1; }
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
    if (Array.isArray(parsed.files) && parsed.files.length) return { files: parsed.files.filter((file) => typeof file?.name === "string" && typeof file?.csv === "string") };
  } catch { /* legacy single-file input handled below */ }
  return { files: [{ name: "spotify.csv", csv: value }] };
}
function detectType(csv: string): "engagement" | "topEpisodes" | "unknown" {
  const header = parseCsv(csv)[0]?.map(normalizeHeader) ?? [];
  if (header.includes("date") && header.includes("average consumption time (hours)") && header.includes("followers")) return "engagement";
  if (header.includes("episode title") && header.includes("episode uri") && header.includes("consumption time (hours)")) return "topEpisodes";
  return "unknown";
}
function parseEngagement(csv: string) {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  const headers = rows[0].map(normalizeHeader);
  const indexes = { date: find(headers, ["date"]), consumption: find(headers, ["consumption time (hours)"]), average: find(headers, ["average consumption time (hours)"]), comments: find(headers, ["comments"]), followers: find(headers, ["followers"]) };
  if (Object.values(indexes).some((index) => index < 0)) throw new AppError("VALIDATION_FAILED", "The Engagement export does not have the expected Spotify columns.");
  const parsed = rows.slice(1).map((row, index) => ({ date: requireDate(row[indexes.date], index + 2), consumptionHours: requireNumber(row[indexes.consumption], index + 2), averageConsumptionHours: requireNumber(row[indexes.average], index + 2), comments: requireNumber(row[indexes.comments], index + 2), followers: requireNumber(row[indexes.followers], index + 2) })).sort((a,b)=>a.date.localeCompare(b.date));
  if (!parsed.length) throw new AppError("VALIDATION_FAILED", "The Engagement export contains no data rows.");
  return parsed;
}
function parseTopEpisodes(csv: string) {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  const headers = rows[0].map(normalizeHeader);
  const indexes = { title: find(headers, ["episode title"]), consumption: find(headers, ["consumption time (hours)"]), publishDate: find(headers, ["publish date"]), uri: find(headers, ["episode uri"]) };
  if (Object.values(indexes).some((index) => index < 0)) throw new AppError("VALIDATION_FAILED", "The Top Episodes export does not have the expected Spotify columns.");
  const parsed = rows.slice(1).map((row, index) => ({ episodeTitle: String(row[indexes.title] ?? "").trim(), consumptionHours: requireNumber(row[indexes.consumption], index + 2), publishDate: requireDate(row[indexes.publishDate], index + 2), episodeUri: String(row[indexes.uri] ?? "").trim() }));
  if (parsed.some((row) => !row.episodeTitle || !row.episodeUri)) throw new AppError("VALIDATION_FAILED", "The Top Episodes export contains a row with a missing episode title or URI.");
  return parsed;
}
function metric(name: string, value: number, unit: string, date: string, sourceRecordId: string, range: DateRange, extra: Record<string, string | number>): RawConnectorMetric {
  return { sourceRecordId, metricName: name, value, unit, date, targetTableKey: "kpiHistory", platform: "Spotify", channel: "Podcast", activityVolume: Number(extra.activityVolume ?? 0), dimensions: { periodStart: range.start, periodEnd: range.end, ...extra } };
}
function parseFilenameRange(name: string): DateRange | undefined {
  const match = /_(\d{1,2})-(\d{1,2})-(\d{4})--(\d{1,2})-(\d{1,2})-(\d{4})\.csv$/i.exec(name);
  if (!match) return undefined;
  const start = dateParts(Number(match[3]), Number(match[1]), Number(match[2])); const end = dateParts(Number(match[6]), Number(match[4]), Number(match[5]));
  return start && end ? { start, end } : undefined;
}
function metricLabel(key: string) { return ({ spotify_consumption_hours: "Consumption Time", spotify_average_consumption_hours: "Average Consumption Time", spotify_comments: "Comments", spotify_followers: "Followers" } as Record<string,string>)[key] ?? key; }
function reportingMonth(date: string) { const [, month, year] = /^(\d{4})-(\d{2})/.exec(date) ?? []; return month && year ? `${Number(month)}-${year}` : ""; }
function fieldsMatch(existing: Record<string, unknown>, incoming: AirtableFields) { return ["Metric Key","Value","Unit","Date","Snapshot Date","Period Start","Period End","Source Record ID"].every((field) => String(existing[field] ?? "") === String(incoming[field] ?? "")); }
function parseCsv(csv: string): string[][] { const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;for(let i=0;i<csv.length;i+=1){const c=csv[i],n=csv[i+1];if(c==='"'){if(quoted&&n==='"'){cell+='"';i+=1}else quoted=!quoted}else if(c===","&&!quoted){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&n==="\n")i+=1;row.push(cell);rows.push(row);row=[];cell=""}else cell+=c}if(cell.length||row.length){row.push(cell);rows.push(row)}return rows; }
function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function find(headers: string[], aliases: string[]) { return headers.findIndex((header) => aliases.includes(header)); }
function requireNumber(value: unknown, line: number) { const text=String(value??"").trim().replace(/,/g,"");const parsed=Number(text);if(!text||!Number.isFinite(parsed)||parsed<0)throw new AppError("VALIDATION_FAILED",`Spotify CSV row ${line} contains an invalid number.`);return parsed; }
function requireDate(value: unknown, line: number) { const date=normalizeDate(String(value??""));if(!date)throw new AppError("VALIDATION_FAILED",`Spotify CSV row ${line} contains an invalid date.`);return date; }
function normalizeDate(value: string): string | undefined { const text=value.trim();if(!text)return undefined;const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);if(iso)return dateParts(Number(iso[1]),Number(iso[2]),Number(iso[3]));const us=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);if(us)return dateParts(Number(us[3]),Number(us[1]),Number(us[2]));return undefined; }
function dateParts(year:number,month:number,day:number):string|undefined{const date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString().slice(0,10):undefined;}
