export const FIELDS = {
  sources: {
    key: "Source Key",
    name: "Name"
  },
  kpis: {
    key: "KPI Key",
    name: "Name",
    sourceName: "Source Name" 
  },
  records: {
    uniqueKey: "Unique Key",
    kpi: "KPI",
    source: "KPI Source",
    importJob: "Import Job",
    reportingDate: "Reporting Date",
    periodType: "Period Type",
    value: "Value",
    unit: "Unit",
    rawJson: "Raw JSON"
  },
  jobs: {
    name: "Name",
    jobId: "Job ID",
    status: "Status",
    startedAt: "Started At",
    finishedAt: "Finished At",
    recordsCreated: "Records Created",
    recordsUpdated: "Records Updated",
    recordsFailed: "Records Failed",
    errorMessage: "Error Message"
  }
} as const;

export const REQUIRED_FIELDS = {
  kpiSources: [FIELDS.sources.key, FIELDS.sources.name],
  kpis: [FIELDS.kpis.key, FIELDS.kpis.name],
  kpiRecords: Object.values(FIELDS.records),
  importJobs: Object.values(FIELDS.jobs)
} as const;
