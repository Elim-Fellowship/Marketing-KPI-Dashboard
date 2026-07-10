import type { AirtableFields } from "../airtable/client.js";
import type { ConnectionStatus, ConnectorSyncResult } from "../connectors/types.js";

export interface DataSourceStatusModel {
  sourceName: string;
  sourceType: string;
  connectionStatus: string;
  lastUpdateDate: string;
  notes?: string;
}

export const DATA_SOURCE_STATUS_FIELDS = {
  sourceName: "Source Name",
  sourceType: "Source Type",
  connectionStatus: "Connection Status",
  lastUpdateDate: "Last Update Date",
  notes: "Notes"
} as const;

export function statusFromSyncResult(
  result: ConnectorSyncResult,
  _mockMode: boolean
): DataSourceStatusModel {
  const connectionStatus: ConnectionStatus =
    result.status === "Success"
      ? "Connected"
      : result.status === "Skipped"
      ? "Needs Setup"
      : "Error";

return {
  sourceName: "Spotify",
  sourceType: result.connectorId,
  connectionStatus,
  lastUpdateDate: new Date().toISOString(),
  notes: result.message,
  };
}

function cleanAirtableFields(obj: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([key, value]) => key !== "undefined" && value !== undefined
    )
  );
}

export function toDataSourceStatusFields(status: DataSourceStatusModel): AirtableFields {
  return cleanAirtableFields({
    "Source Name": status.sourceName,
    "Source Type": status.sourceType,
    "Connection Status": status.connectionStatus,
    "Last Update Date": status.lastUpdateDate,
    Notes: status.notes
  });
}
