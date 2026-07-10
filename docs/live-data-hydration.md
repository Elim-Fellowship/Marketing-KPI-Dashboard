# Live Airtable Data Hydration

The dashboard pages now read from Airtable-backed API responses only. Missing source rows should render as `No data available` rather than sample values.

## Tables Used by Page

KPI Overview:

- `KPI_History`
- `Monthly_Activity_Summary`
- `Spotify_Weekly_Snapshot`
- `Data_Source_Status`
- `Content_Performance`

Top Performing Content:

- `Content_Performance`

Channel Breakdown:

- `Channel_Performance`

Diagnostics:

- `KPI_History`
- `Content_Performance`
- `Spotify_Weekly_Snapshot`
- `Data_Source_Status`
- `Channel_Performance`
- `Monthly_Activity_Summary`

## Required Fields by Page

### KPI Overview

`Monthly_Activity_Summary`:

- `Date`
- `Emails Sent`
- `Podcasts Published`
- `Social Posts Published`
- `Website Articles Published`
- `Newsletter Editions Published`
- Optional: `Total Published`

`KPI_History`:

- `KPI`, `KPI Name`, `Metric`, or `Name`
- `Value`, `Metric Value`, `Current Value`, or `Amount`
- `Date`, `Reporting Date`, `Period`, `Month`, or `Week`
- Optional: `Unit` or `Format`

Expected KPI metric names:

- `Email Click Rate`
- `Email Open Rate`
- `Subscriber Growth`
- `Unsubscribe Rate`
- `Posts Published`
- `Likes`
- `Comments`
- `Shares`
- `Listener Growth`
- `Streams`
- `Podcasts Published`
- `Website Visitors`
- `Website Clicks`
- `Website Engagement`
- `New Followers`
- `New Subscribers`
- `New Podcast Listeners`
- `Content Published`

`Spotify_Weekly_Snapshot`:

- `Date`, `Week`, or `Snapshot Date`
- `Streams`, `Downloads`, `Listeners`, `Plays`, or `Value`

`Data_Source_Status`:

- `Source Name`, `Source`, `Name`, or `Data Source`
- `Connection Status`, `Status`, or `State`
- `Last Sync Time`, `Last Successful Sync`, `Last Updated`, `Updated At`, or `Last Sync`

### Top Performing Content

`Content_Performance`:

- `Title`, `Name`, `Content Title`, or `Episode Title`
- `Platform`, `Channel`, or `Source`
- `Content Type`, `Type`, or `Format`
- `Published At`, `Publish Date`, `Date`, or `Created At`
- Ranking: `Rank`, `Ranking`, `Sort Order`, or `Position`
- Score: `Content Score`, `Performance Score`, `Ranking Score`, `Score`, `Metric Value`, or `Value`
- Optional grouping: `Campaign`, `Episode Drop`, `Marketing Push`

The backend no longer calculates a weighted ranking score for this page. It sorts by Airtable rank first, then by Airtable score fields.

### Channel Breakdown

`Channel_Performance`:

- `Channel`, `Platform`, `Source`, or `Name`
- `Date`, `Reporting Date`, `Period`, `Period Start`, `Month`, or `Week`
- `Activity Volume`, `Total Activity Volume`, `Total Activity`, `Volume`, or `Content Volume`
- `Metric Label`, `Metric`, or `KPI`
- `Metric Value`, `Value`, or the channel-specific metric field
- `Previous Metric Value`, `Previous Value`, or `Previous Period Value`
- `Change Percent`, `Growth Percent`, or `Percentage Change`
- Optional: `Color`

Channel-specific metric fields:

- Instagram: `Likes` or `Total Likes`
- Facebook: `Likes` or `Total Likes`
- Email: `Clicks`, `Link Clicks`, `Email Clicks`, or `Total Clicks`
- Spotify: `Streams`, `Plays`, or `Value`
- Castos: `Downloads` or `Total Downloads`
- YouTube: `Views`, `Streams`, or `Plays`
- Website: `Clicks`, `Link Clicks`, `Website Clicks`, or `Total Clicks`
- Voice of Elim: `Clicks`, `Link Clicks`, `Email Clicks`, or `Total Clicks`
- Elim Updates: `Clicks`, `Link Clicks`, `Email Clicks`, or `Total Clicks`

## Diagnostics

The diagnostics endpoint is:

```text
GET /api/data-health
```

It returns:

- Airtable connection status
- Availability for each required table
- Record counts
- Empty tables
- Missing fields inferred from available records

## Remaining Mock Data Locations

Dashboard pages no longer use mock/sample data. The only remaining mock data is intentionally isolated in the ingestion connector placeholders:

- `apps/backend/src/connectors/mailchimpConnector.ts`
- `apps/backend/src/connectors/castosConnector.ts`
- `apps/backend/src/connectors/youtubeConnector.ts`
- `apps/backend/src/connectors/websiteConnector.ts`
- `apps/backend/src/connectors/spotifyConnector.ts`
- Legacy placeholder KPI connector: `apps/backend/src/connectors/exampleConnector.ts`

These mock connectors do not hydrate the dashboard unless their sync endpoint is explicitly run.

## Remaining Blockers Before Live API Integrations

- Confirm exact Airtable field names and field types for `Channel_Performance`.
- Confirm exact Airtable field names and field types for `Monthly_Activity_Summary`.
- Add external platform credentials in deployment environments.
- Replace each mock connector `fetchMetrics()` implementation with real API calls.
- Run `/api/data-health` after Airtable schema updates and resolve missing fields before enabling writes.
