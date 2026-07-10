export const AirtableSchema = {
  dataSourceStatus: {
    sourceName: "Source Name",
    connectorId: "Connector ID",
    connectionStatus: "Connection Status",
    lastSyncTime: "Last Sync Time",
    lastSuccessfulSync: "Last Successful Sync",
    syncResult: "Sync Result",
    errorMessage: "Error Message",
    recordsProcessed: "Records Processed",
    mockMode: "Mock Mode"
  }
} as const;
