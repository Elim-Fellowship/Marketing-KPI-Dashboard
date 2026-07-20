export interface NormalizedAirtableRecord<TFields extends Record<string, unknown>> {
  id: string;
  createdTime?: string;
  fields: TFields;
}

export interface KpiSourceFields extends Record<string, unknown> {
  "Source Key"?: string;
  Name?: string;
  Description?: string;
  Active?: boolean;
}

export interface KpiFields extends Record<string, unknown> {
  "KPI Key"?: string;
  Name?: string;
  Source?: string[];
  Unit?: string;
  Description?: string;
  Active?: boolean;
}

export interface KpiRecordFields extends Record<string, unknown> {
  "Unique Key"?: string;
  KPI?: string[];
  "KPI Source"?: string[];
  "Import Job"?: string[];
  "Reporting Date"?: string;
  "Period Type"?: string;
  Value?: number;
  Unit?: string;
  "Raw JSON"?: string;
}

export interface DashboardViewFields extends Record<string, unknown> {
  Name?: string;
  Description?: string;
  Active?: boolean;
  "Sort Order"?: number;
}

export interface AlertFields extends Record<string, unknown> {
  Name?: string;
  Title?: string;
  Status?: string;
  Severity?: string;
  Message?: string;
  "Created At"?: string;
  "Triggered At"?: string;
}

export interface SpotifyWeeklySnapshotFields extends Record<string, unknown> {
  Date?: string;
  Streams?: number;
  Listeners?: number;
  Followers?: number;
  TopEpisode?: string;
}

export interface SpotifyEpisodeMetricsFields extends Record<string, unknown> {
  "Episode Name"?: string;
  "Publish Date"?: string;
  "Total Streams"?: number;
  Likes?: number;
  Downloads?: number;
  Source?: string;
  "Reporting Week"?: string;
  "Reporting Month"?: string;
  "Stream Growth Rate"?: number;
  "Engagement Rate"?: number;
  "Week-over-Week Comparison (AI)"?: string;
  Notes?: string;
  "Dashboard View"?: string;
  Performance?: number;
  "Import Date"?: string;
}

export interface ContentPerformanceFields extends Record<string, unknown> {
  Title?: string;
  Name?: string;
  Platform?: string;
  Channel?: string;
  Source?: string;
  "Content Type"?: string;
  Type?: string;
  Format?: string;
  Views?: number;
  Listens?: number;
  Listeners?: number;
  Downloads?: number;
  Streams?: number;
  Plays?: number;
  Engagements?: number;
  Likes?: number;
  Comments?: number;
  Shares?: number;
  Saves?: number;
  Reactions?: number;
  Opens?: number;
  Clicks?: number;
  Retention?: number;
  "Retention Rate"?: number;
  "Average Retention"?: number;
  "Avg Retention"?: number;
  "Completion Rate"?: number;
  Score?: number;
  Value?: number;
  Campaign?: string;
  "Campaign Name"?: string;
  "Campaign ID"?: string;
  "Episode Drop"?: string;
  Drop?: string;
  "Episode Launch"?: string;
  Launch?: string;
  "Marketing Push"?: string;
  Push?: string;
  Promotion?: string;
  "Promo Name"?: string;
  "Published At"?: string;
  "Publish Date"?: string;
  Date?: string;
  URL?: string;
  Link?: string;
}

export interface KpiHistoryFields extends Record<string, unknown> {
  "Unique Key"?: string;
  KPI?: string;
  "KPI Name"?: string;
  Metric?: string;
  "Metric Key"?: string;
  Name?: string;
  Value?: number;
  "Metric Value"?: number;
  "Current Value"?: number;
  Amount?: number;
  Date?: string;
  "Reporting Date"?: string;
  "Snapshot Date"?: string;
  "Reporting Week"?: string;
  "Reporting Month"?: string;
  "Week Number"?: number;
  Period?: string;
  "Period Type"?: string;
  "Period Start"?: string;
  "Period End"?: string;
  Month?: string;
  Week?: string;
  Unit?: string;
  "Aggregation Method"?: string;
  Channel?: string;
  Platform?: string;
  "Source Name"?: string;
  "Quality Status"?: string;
  Numerator?: number;
  Denominator?: number;
  "Previous Value"?: number;
  "Change Percent"?: number;
  "Source Record ID"?: string;
  "Last Synced At"?: string;
}

export interface DataSourceStatusFields extends Record<string, unknown> {
  "Source Name"?: string;
  "Connector ID"?: string;
  "Connection Status"?: string;
  "Last Sync Time"?: string;
  "Last Successful Sync"?: string;
  "Sync Result"?: string;
  "Error Message"?: string;
  "Records Processed"?: number;
  "Mock Mode"?: boolean;
  Source?: string;
  Name?: string;
  "Data Source"?: string;
  Status?: string;
  State?: string;
  "Last Updated"?: string;
  "Updated At"?: string;
  "Last Sync"?: string;
  Notes?: string;
  Message?: string;
  Details?: string;
}

export interface ChannelPerformanceFields extends Record<string, unknown> {
  Channel?: string;
  Platform?: string;
  Source?: string;
  Name?: string;
  Date?: string;
  "Reporting Date"?: string;
  Period?: string;
  "Period Start"?: string;
  "Period End"?: string;
  "Activity Volume"?: number;
  "Total Activity Volume"?: number;
  "Total Activity"?: number;
  Volume?: number;
  "Metric Label"?: string;
  Metric?: string;
  KPI?: string;
  Value?: number;
  "Metric Value"?: number;
  Likes?: number;
  Clicks?: number;
  Streams?: number;
  Downloads?: number;
  Views?: number;
  "Previous Value"?: number;
  "Previous Metric Value"?: number;
  "Previous Period Value"?: number;
  "Change Percent"?: number;
  "Growth Percent"?: number;
  "Percentage Change"?: number;
  Color?: string;
}

export interface MonthlyActivitySummaryFields extends Record<string, unknown> {
  Date?: string;
  Month?: string;
  Period?: string;
  "Reporting Date"?: string;
  "Period Start"?: string;
  "Period End"?: string;
  "Emails Sent"?: number;
  "Podcasts Published"?: number;
  "Social Posts Published"?: number;
  "Website Articles Published"?: number;
  "Newsletter Editions Published"?: number;
  "Total Published"?: number;
}

export type AirtableTableKey =
  | "kpiSources"
  | "kpis"
  | "kpiRecords"
  | "dashboardViews"
  | "alerts"
  | "spotifyWeeklySnapshot"
  | "spotifyEpisodeMetrics"
  | "contentPerformance"
  | "kpiHistory"
  | "dataSourceStatus"
  | "channelPerformance"
  | "monthlyActivitySummary";

export interface AirtableTableRecordMap {
  kpiSources: KpiSourceFields;
  kpis: KpiFields;
  kpiRecords: KpiRecordFields;
  dashboardViews: DashboardViewFields;
  alerts: AlertFields;
  spotifyWeeklySnapshot: SpotifyWeeklySnapshotFields;
spotifyEpisodeMetrics: SpotifyEpisodeMetricsFields;  
contentPerformance: ContentPerformanceFields;
  kpiHistory: KpiHistoryFields;
  dataSourceStatus: DataSourceStatusFields;
  channelPerformance: ChannelPerformanceFields;
  monthlyActivitySummary: MonthlyActivitySummaryFields;
}
