# Data Ingestion Framework

This framework is the foundation for sending external platform analytics into Airtable. It is intentionally architecture-only for now: connectors use mock data, no live third-party APIs are called, and writes are dry-run by default through the ingestion API.

## Folder Structure

```text
apps/backend/src/connectors/
  baseConnector.ts
  types.ts
  registry.ts
  mailchimpConnector.ts
  castosConnector.ts
  youtubeConnector.ts
  websiteConnector.ts
  spotifyConnector.ts

apps/backend/src/services/
  syncManager.ts
  dataSourceStatusModel.ts
```

## Connector Architecture

Every connector implements the same interface:

```text
authenticate()
fetchMetrics()
transformData()
writeToAirtable()
sync()
```

The shared lifecycle is:

```text
Sync Manager
  -> authenticate connector
  -> fetch source metrics
  -> normalize metrics into Communications Intelligence records
  -> upsert Airtable rows by Unique Key
  -> update Data_Source_Status
  -> store run history in memory
```

Current connector placeholders:

- `MailchimpConnector`: email clicks, opens, subscriber growth
- `CastosConnector`: podcast downloads, podcasts published
- `YouTubeConnector`: video views and likes
- `WebsiteConnector`: visitors, website clicks, articles published
- `SpotifyConnector`: weekly Spotify streams and listeners

Future connector registrations:

- Facebook
- Instagram

## Backend API

The framework adds these API routes:

```text
GET  /api/ingestion/connectors
GET  /api/ingestion/status
POST /api/ingestion/sync
```

`POST /api/ingestion/sync` defaults to `dryRun=true`, which runs connector logic but does not write mock records into Airtable.

Examples:

```bash
curl http://localhost:3000/api/ingestion/connectors
curl http://localhost:3000/api/ingestion/status
curl -X POST http://localhost:3000/api/ingestion/sync
curl -X POST "http://localhost:3000/api/ingestion/sync?connectorId=mailchimp"
curl -X POST "http://localhost:3000/api/ingestion/sync?dryRun=false"
```

In production, `POST /api/ingestion/sync` should be protected with `SYNC_API_KEY`.

## Airtable Dependencies

The ingestion framework expects Airtable to remain the single source of truth. No local database is used.

Primary target tables:

- `Content_Performance`
- `KPI_History`
- `Spotify_Weekly_Snapshot`
- `Data_Source_Status`

Recommended shared editable field for ingestable tables:

- `Unique Key`: single-line text, unique by source, metric, date, and platform

Do not make `Unique Key` a formula field for ingestion targets if the connector needs to upsert that table directly. Formula and lookup fields cannot be written by the Airtable API.

## Data_Source_Status Fields

Expected editable fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `Source Name` | Single-line text | Unique source label used for status upserts |
| `Connector ID` | Single-line text | Internal connector key, such as `mailchimp` |
| `Connection Status` | Single select | `Connected`, `Disconnected`, `Needs Setup`, or `Error` |
| `Last Sync Time` | Date/time | Most recent sync attempt |
| `Last Successful Sync` | Date/time | Most recent successful sync |
| `Sync Result` | Single select | `Success`, `Failed`, or `Skipped` |
| `Error Message` | Long text | Most recent sync error, if any |
| `Records Processed` | Number | Number of normalized records prepared |
| `Mock Mode` | Checkbox | Indicates mock/manual/future connector mode |

The existing dashboard status APIs also tolerate older field names such as `Source`, `Status`, `Last Sync`, and `Message`.

## Content_Performance Mapping

Expected editable fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `Unique Key` | Single-line text | Upsert key |
| `Source` | Single-line text or single select | Source platform name |
| `Platform` | Single-line text or single select | Display platform |
| `Channel` | Single-line text or single select | Communications channel |
| `Title` | Single-line text | Content item title |
| `Content Type` | Single-line text or single select | Newsletter, podcast episode, video, page, social post |
| `Campaign` | Single-line text | Optional campaign grouping |
| `Date` | Date | Metric reporting date |
| `Metric` | Single-line text | Metric name |
| `Value` | Number | Metric value |
| `Unit` | Single-line text | Value unit |
| `Activity Volume` | Number | Content/output count for the period |
| `Clicks` | Number | Email or website clicks |
| `Opens` | Number | Email opens |
| `Streams` | Number | Audio/video streams |
| `Downloads` | Number | Podcast downloads |
| `Views` | Number | Video/page views |
| `Likes` | Number | Social/video likes |
| `Comments` | Number | Social/video comments |
| `Shares` | Number | Social shares |

## KPI_History Mapping

Expected editable fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `Unique Key` | Single-line text | Upsert key |
| `Source` | Single-line text or single select | Source platform name |
| `KPI` | Single-line text | KPI or metric name |
| `Metric` | Single-line text | Metric name |
| `Value` | Number | Metric value |
| `Unit` | Single-line text | Value unit |
| `Date` | Date | Reporting date |
| `Platform` | Single-line text or single select | Platform name |
| `Channel` | Single-line text or single select | Channel name |
| `Content Type` | Single-line text or single select | Output category |

## Spotify_Weekly_Snapshot Mapping

Expected editable fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `Unique Key` | Single-line text | Upsert key |
| `Source` | Single-line text or single select | `Spotify` |
| `Date` | Date | Snapshot date |
| `Streams` | Number | Weekly streams |
| `Listeners` | Number | Weekly listeners |
| `Metric` | Single-line text | Metric name |
| `Value` | Number | Metric value |
| `Unit` | Single-line text | Value unit |

## Connector-Specific Mapping Requirements

Mailchimp:

- Campaign/list identifier
- Send date
- Opens
- Clicks
- Subscriber growth
- Unsubscribe rate when available

Castos:

- Episode identifier
- Publish date
- Downloads
- Podcasts published

YouTube:

- Video identifier
- Publish date
- Views
- Likes
- Comments and shares when available

Website Analytics:

- Page or article identifier
- Published date or reporting date
- Visitors
- Clicks
- Engagement
- Form submissions or downloads when available

Spotify:

- Snapshot date or week
- Streams
- Listeners
- Listener growth when available

Facebook and Instagram:

- Post identifier
- Publish date
- Impressions
- Likes
- Comments
- Shares
- Audience growth when available

## Recommended API Implementation Order

1. Mailchimp: clear business value and stable email metrics for Email Performance Score.
2. Website Analytics: powers Website Performance Score and article/output reporting.
3. Spotify: already has a dedicated snapshot table and can support manual/semi-automated imports first.
4. Castos: complements Spotify for podcast hosting downloads.
5. YouTube: adds video performance once video taxonomy is confirmed.
6. Facebook and Instagram: implement after platform permissions, Meta app review needs, and post-level field mappings are confirmed.

## Notes Before Live API Work

- Keep every connector idempotent by upserting with `Unique Key`.
- Keep authentication inside connector-specific config; never hardcode secrets.
- Do not write to formula, lookup, rollup, created-time, or last-modified Airtable fields.
- Start each live connector in dry-run mode and compare transformed payloads with expected Airtable fields before enabling writes.
