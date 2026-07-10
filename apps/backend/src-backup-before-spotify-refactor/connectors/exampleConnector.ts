import type { KpiConnector, PlaceholderKpiValue } from "../types/kpi.js";

const sourceKey = "example-source";

export const exampleConnector: KpiConnector = {
  id: "example",
  name: "Example Placeholder KPI Connector",
  async collect(): Promise<PlaceholderKpiValue[]> {
    const now = new Date();
    const reportingDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);

    return [
      {
        sourceKey,
        kpiKey: "monthly-revenue",
        kpiName: "Monthly Revenue",
        value: 48500,
        unit: "USD",
        reportingDate,
        periodType: "monthly",
        rawData: { sample: true, currency: "USD" }
      },
      {
        sourceKey,
        kpiKey: "new-leads",
        kpiName: "New Leads",
        value: 186,
        unit: "count",
        reportingDate,
        periodType: "monthly",
        rawData: { sample: true }
      },
      {
        sourceKey,
        kpiKey: "conversion-rate",
        kpiName: "Conversion Rate",
        value: 7.8,
        unit: "percent",
        reportingDate,
        periodType: "monthly",
        rawData: { sample: true }
      }
    ];
  }
};
