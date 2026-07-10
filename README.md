# Communications Intelligence Platform

Airtable-backed communications analytics application built with Node.js, TypeScript, Express, and a static dashboard shell.

The application now centers on three primary pages:

- KPI Overview
- Top Performing Content
- Channel Breakdown

The frontend is served by the Express backend from `apps/backend/public`.

## Airtable Source Tables

The app reads all records from:

- `KPI Sources`
- `KPIs`
- `KPI Records`
- `Dashboard Views`
- `Alerts`
- `Spotify_Weekly_Snapshot`
- `Content_Performance`
- `KPI_History`
- `Data_Source_Status`
- `Channel_Performance`
- `Monthly_Activity_Summary`

The existing sync foundation can still write placeholder KPI Records and Import Jobs, but the dashboard pages are read-only against Airtable.

## Project Structure

```text
apps/backend/
  public/
    index.html
    styles.css
    app.js
  src/
    airtable/client.ts
    config/env.ts
    connectors/
    services/communicationsAnalyticsService.ts
    services/syncManager.ts
    services/kpiSyncService.ts
    app.ts
    server.ts
```

## Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required:

```text
AIRTABLE_PAT=pat_your_token
AIRTABLE_BASE_ID=appkVACwRd625LQO8
```

Analytics table names:

```text
AIRTABLE_TABLE_KPI_SOURCES=KPI Sources
AIRTABLE_TABLE_KPIS=KPIs
AIRTABLE_TABLE_KPI_RECORDS=KPI Records
AIRTABLE_TABLE_DASHBOARD_VIEWS=Dashboard Views
AIRTABLE_TABLE_ALERTS=Alerts
AIRTABLE_TABLE_SPOTIFY_WEEKLY_SNAPSHOT=Spotify_Weekly_Snapshot
AIRTABLE_TABLE_CONTENT_PERFORMANCE=Content_Performance
AIRTABLE_TABLE_KPI_HISTORY=KPI_History
AIRTABLE_TABLE_DATA_SOURCE_STATUS=Data_Source_Status
AIRTABLE_TABLE_CHANNEL_PERFORMANCE=Channel_Performance
AIRTABLE_TABLE_MONTHLY_ACTIVITY_SUMMARY=Monthly_Activity_Summary
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/health
```

Analytics APIs:

```bash
curl http://localhost:3000/api/home
curl http://localhost:3000/api/overview
curl "http://localhost:3000/api/top-content?timeframe=90d&platform=all"
curl "http://localhost:3000/api/top-content?timeframe=90d&platform=all&groupBy=campaign"
curl "http://localhost:3000/api/comparative?period=month"
curl http://localhost:3000/api/status
curl http://localhost:3000/api/data-health
curl http://localhost:3000/api/comms/tables
curl http://localhost:3000/api/comms/spotify-weekly-snapshot
curl http://localhost:3000/api/comms/content-performance
curl http://localhost:3000/api/comms/kpi-history
curl http://localhost:3000/api/comms/data-source-status
curl http://localhost:3000/api/comms/channel-performance
curl http://localhost:3000/api/comms/monthly-activity-summary
curl http://localhost:3000/api/ingestion/connectors
curl http://localhost:3000/api/ingestion/status
curl -X POST http://localhost:3000/api/ingestion/sync
curl http://localhost:3000/api/airtable
curl http://localhost:3000/api/airtable/kpi-sources
curl http://localhost:3000/api/airtable/kpis
curl http://localhost:3000/api/airtable/kpi-records
curl http://localhost:3000/api/airtable/dashboard-views
curl http://localhost:3000/api/airtable/alerts
curl http://localhost:3000/api/airtable/spotify-weekly-snapshot
curl http://localhost:3000/api/airtable/content-performance
curl http://localhost:3000/api/airtable/kpi-history
curl http://localhost:3000/api/airtable/data-source-status
curl http://localhost:3000/api/airtable/channel-performance
curl http://localhost:3000/api/airtable/monthly-activity-summary
```

API responses are cached in memory for `AIRTABLE_CACHE_TTL_MS` milliseconds. Airtable remains the single source of truth; there is no local database.

Primary Communications Intelligence pages use:

- `Spotify_Weekly_Snapshot`
- `Content_Performance`
- `KPI_History`
- `Data_Source_Status`
- `Channel_Performance`
- `Monthly_Activity_Summary`

Legacy diagnostic/sync routes still exist for `KPI Sources`, `KPIs`, `KPI Records`, `Import Jobs`, `Dashboard Views`, and `Alerts`, but those tables no longer drive the three primary pages.

## Communications Intelligence Model

The backend translates Airtable rows into business-defined analytics concepts before the dashboard renders them.

- `Reporting History Coverage`: count and date coverage of usable `KPI_History` rows.
- `Growth Rate`: percent change over time, calculated as `(current value - previous comparable value) / absolute previous value`.
- `Time-Series Performance Data`: ordered KPI observations used for trend charts and period comparisons.
- `Communications Performance Score`: overall communications performance across all major channels.
- `Email Performance Score`: 40% Click Rate, 30% Open Rate, 20% Subscriber Growth, 10% Unsubscribe Rate.
- `Social Media Performance Score`: 20% Posts Published, 30% Likes, 25% Comments, 25% Shares.
- `Podcast Performance Score`: 40% Listener Growth, 40% Streams Per Episode, 20% Streams.
- `Website Performance Score`: 40% Visitors, 35% Clicks, 25% Engagement.
- `Content Score`: weighted score for ranked content using listens, retention, and engagement.
- `Content Score Breakdown`: per-item explanation showing why it ranked, which metrics contributed, and each metric's percentage contribution.

Initial performance scores are benchmark-free. Until targets are defined, volume components use relative volume scoring. Full formula documentation lives in `docs/kpi-calculation-engine.md`.

The data ingestion framework is documented in `docs/data-ingestion-framework.md`. Live dashboard hydration is documented in `docs/live-data-hydration.md`. The ingestion framework currently includes mock connector placeholders for Mailchimp, Castos, YouTube, Website Analytics, and Spotify, plus future registrations for Facebook and Instagram.

The live Mailchimp backend integration is documented in `docs/mailchimp-integration.md`.

The current communications score formula is:

```text
Communications Performance Score =
(
  Email Performance Score +
  Social Media Performance Score +
  Podcast Performance Score +
  Website Performance Score
) / 4
```

The channel performance score formulas are:

```text
Email Performance Score =
(Click Rate score * 40%) + (Open Rate score * 30%) + (Subscriber Growth score * 20%) + (Unsubscribe Rate Health score * 10%)

Social Media Performance Score =
(Posts Published score * 20%) + (Likes score * 30%) + (Comments score * 25%) + (Shares score * 25%)

Podcast Performance Score =
(Listener Growth score * 40%) + (Streams Per Episode score * 40%) + (Streams score * 20%)

Streams Per Episode =
Streams / Podcasts Published

Website Performance Score =
(Visitors score * 40%) + (Clicks score * 35%) + (Engagement score * 25%)
```

Top Performing Content ranking is Airtable-provided:

```text
Content_Performance ranking =
Rank / Ranking / Sort Order / Position, then Content Score / Performance Score / Ranking Score / Score / Metric Value / Value
```

The backend no longer applies a weighted ranking formula for Top Performing Content. Airtable owns the ranking and score values.

Score values in the dashboard include a small info icon that exposes the KPI name, formula, weights, and current component values when available.

## Page Data Model

### KPI Overview

Reads from:

- `KPI_History`
- `Spotify_Weekly_Snapshot`
- `Data_Source_Status`

Displays:

- Executive summary
- KPI cards
- Reporting History Coverage
- Growth Rate (% change over time)
- Communications Performance Score
- Time-Series Performance Data
- Data source status

### Top Performing Content

Reads from:

- `Content_Performance`

Displays:

- Top podcast episodes
- Top newsletters
- Top social posts
- Top videos
- Timeframe and platform filters
- Campaign, episode drop, and marketing push grouping when those fields exist
- Content Score formula and Content Score Breakdown

### Channel Breakdown

Reads from:

- `KPI_History`
- `Content_Performance`
- `Spotify_Weekly_Snapshot`

Displays:

- Communications Performance Change for the selected date range versus the previous equivalent period
- Channel-specific activity cards for Instagram, Facebook, Email, Spotify, Castos, YouTube, Website, Voice of Elim, and Elim Updates
- Content Trends multi-line chart with a selectable channel legend
- Percentage increase or decrease by channel

## Expected Airtable Field Names

The analytics layer is intentionally tolerant and checks common field names.

For `KPI_History`, useful fields include:

- `KPI`, `KPI Name`, `Metric`, or `Name`
- `Value`, `Metric Value`, `Current Value`, or `Amount`
- `Date`, `Reporting Date`, `Period`, `Month`, or `Week`
- `Unit` or `Format`

Expected `KPI_History` metric names for the approved score model:

- Email Performance Score: `Email Click Rate` or `Newsletter Click Rate`, `Email Open Rate` or `Newsletter Open Rate`, `Subscriber Growth`, `Unsubscribe Rate`
- Social Media Performance Score: `Posts Published`, `Likes`, `Comments`, `Shares`
- Podcast Performance Score: `Listener Growth`, `Streams`, `Podcasts Published`
- Website Performance Score: `Website Visitors`, `Website Clicks`, `Website Engagement`

Expected fields or metric names for the KPI Overview `Monthly Activity Summary`:

- `KPI_History`: `Emails Sent`, `Podcasts Published` or `Episodes Published`, `Social Posts Published`, `Website Articles Published` or `Blog Posts Published`, `Newsletter Editions Published`
- `Content_Performance`: `Content Type`, `Type`, or `Format`; `Platform`, `Channel`, or `Source`; `Published At`, `Publish Date`, or `Date`
- The activity summary first uses matching `KPI_History` volume metrics. If those metrics are not present, it falls back to counting matching `Content_Performance` rows in the selected date range.

These mappings are placeholders and intentionally tolerant. Final Airtable field names can be tightened once the real ingestion pipeline is connected.

Expected fields or metric names for `Channel Breakdown`:

- Shared date fields: `Published At`, `Publish Date`, `Date`, `Created At`, `Reporting Date`, `Week`, or `Snapshot Date`
- Shared channel fields: `Platform`, `Channel`, `Source`, `Content Type`, `Type`, `Format`, `Title`, `Name`, `Campaign`, or `Campaign Name`
- Activity volume fields when available: `Activity Volume`, `Total Activity`, `Volume`, `Content Volume`, `Posts Published`, `Items Published`, or `Quantity`
- Instagram and Facebook: `Likes` or `Total Likes`
- Email, Website, Voice of Elim, and Elim Updates: `Clicks`, `Link Clicks`, `Email Clicks`, `Website Clicks`, or `Total Clicks`
- Spotify: `Streams`, `Plays`, or `Value`; Spotify can also read from `Spotify_Weekly_Snapshot`
- Castos: `Downloads` or `Total Downloads`
- YouTube: `Views`, `Streams`, or `Plays`
- `KPI_History` metric names should combine the channel and metric where possible, for example `Instagram Likes`, `Spotify Streams`, `Elim Updates Clicks`, or `Website Clicks`.

For `Content_Performance`, useful fields include:

- `Title`, `Name`, `Content Title`, or `Episode Title`
- `Platform`, `Channel`, or `Source`
- `Content Type`, `Type`, or `Format`
- Listens component: `Listens`, `Listeners`, `Streams`, `Downloads`, `Plays`, `Views`, or `Opens`
- Retention component: `Retention`, `Retention Rate`, `Average Retention`, `Avg Retention`, or `Completion Rate`
- Engagement component: `Engagements`, `Clicks`, `Likes`, `Comments`, `Shares`, `Saves`, or `Reactions`
- Fallback score fields: `Score` or `Value`
- Grouping fields: `Campaign`, `Campaign Name`, `Episode Drop`, `Episode Launch`, `Marketing Push`, or `Promotion`
- `Published At`, `Publish Date`, `Date`, or `Created At`
- `URL`, `Link`, or `Permalink`

For `Data_Source_Status`, useful fields include:

- `Source Name`, `Source`, `Name`, or `Data Source`
- `Connection Status`, `Status`, or `State`
- `Last Sync Time`, `Last Successful Sync`, `Last Updated`, `Updated At`, or `Last Sync`
- `Error Message`, `Sync Result`, `Notes`, `Message`, or `Details`

For connector-managed `Data_Source_Status` rows, recommended editable fields are:

- `Source Name`
- `Connector ID`
- `Connection Status`
- `Last Sync Time`
- `Last Successful Sync`
- `Sync Result`
- `Error Message`
- `Records Processed`
- `Mock Mode`

For `Spotify_Weekly_Snapshot`, useful fields include:

- `Date`, `Week`, or `Snapshot Date`
- `Streams`, `Downloads`, `Listeners`, `Plays`, or `Value`

## Adding Future Analytics Pages

1. Add a method to `CommunicationsAnalyticsService`.
2. Add an `/api/...` route in `app.ts`.
3. Register a new page in `apps/backend/public/app.js`.
4. Add page-specific layout styles in `styles.css`.

The Airtable client stays reusable across all future pages.

## Render Deployment

Render Web Service:

```text
Environment: Node
Root Directory: .
Build Command: npm install --include=dev && npm run build
Start Command: npm run start
Health Check Path: /health
```

Set the environment variables from `.env.example` in Render.
