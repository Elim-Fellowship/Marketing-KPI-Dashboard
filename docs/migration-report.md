# Communications Intelligence Platform Migration Report

## Target Source Of Truth

The primary source of truth for active Communications Intelligence pages should be:

- `Spotify_Weekly_Snapshot`
- `Content_Performance`
- `KPI_History`
- `Data_Source_Status`

Legacy tables remain available during migration, but they should not drive the primary dashboard pages:

- `KPI Sources`
- `KPIs`
- `KPI Records`
- `Import Jobs`
- `Dashboard Views`
- `Alerts`

## Current API Route Audit

| Route | Current tables used | Legacy dependency | Recommendation |
| --- | --- | --- | --- |
| `GET /health` | None | None | Retain. |
| `POST /sync` | `KPI Sources`, `KPIs`, `KPI Records`, `Import Jobs` | Yes | Retain temporarily as legacy sync. Do not use for Communications Intelligence pages. |
| `GET /kpis` | `KPIs` | Yes | Retain temporarily as legacy diagnostic route. Prefer `/api/comms/kpi-history`. |
| `GET /records` | `KPI Records` | Yes | Retain temporarily as legacy diagnostic route. Prefer `/api/comms/kpi-history`. |
| `GET /jobs` | `Import Jobs` | Yes | Retain temporarily as legacy sync diagnostic route. |
| `GET /api/home` | `KPI_History`, `Content_Performance`, `Data_Source_Status`, `Spotify_Weekly_Snapshot` | No | Migrated. Retain as the dashboard homepage API. |
| `GET /api/overview` | `KPI_History`, `Data_Source_Status`, `Spotify_Weekly_Snapshot` | No | Retain as primary KPI Overview API. |
| `GET /api/top-content` | `Content_Performance` | No | Retain as primary Top Performing Content API. |
| `GET /api/comparative` | `KPI_History` | No | Retain as primary Comparative Analysis API. |
| `GET /api/status` | `Data_Source_Status` | No | Retain as primary data-source status API. |
| `GET /api/comms/tables` | `Spotify_Weekly_Snapshot`, `Content_Performance`, `KPI_History`, `Data_Source_Status` | No | New primary aggregate route for Communications Intelligence source tables. |
| `GET /api/comms/spotify-weekly-snapshot` | `Spotify_Weekly_Snapshot` | No | New primary table route. |
| `GET /api/comms/content-performance` | `Content_Performance` | No | New primary table route. |
| `GET /api/comms/kpi-history` | `KPI_History` | No | New primary table route. |
| `GET /api/comms/data-source-status` | `Data_Source_Status` | No | New primary table route. |
| `GET /api/airtable` | `KPI Sources`, `KPIs`, `KPI Records`, `Dashboard Views`, `Alerts`, `Spotify_Weekly_Snapshot`, `Content_Performance`, `KPI_History` | Yes | Retain temporarily for audit/debugging, but do not use in primary pages. |
| `GET /api/airtable/kpi-sources` | `KPI Sources` | Yes | Retain temporarily as legacy diagnostic route. |
| `GET /api/airtable/kpis` | `KPIs` | Yes | Retain temporarily as legacy diagnostic route. |
| `GET /api/airtable/kpi-records` | `KPI Records` | Yes | Retain temporarily as legacy diagnostic route. |
| `GET /api/airtable/dashboard-views` | `Dashboard Views` | Yes | Retain temporarily as legacy diagnostic route. |
| `GET /api/airtable/alerts` | `Alerts` | Yes | Retain temporarily as legacy diagnostic route. |
| `GET /api/airtable/spotify-weekly-snapshot` | `Spotify_Weekly_Snapshot` | No | Retain. |
| `GET /api/airtable/content-performance` | `Content_Performance` | No | Retain. |
| `GET /api/airtable/kpi-history` | `KPI_History` | No | Retain. |

## Current Page Audit

| Page | Current primary API | Current tables used | Legacy dependency | Recommendation |
| --- | --- | --- | --- | --- |
| KPI Overview | `/api/home`, `/api/overview`, `/api/status` | `KPI_History`, `Content_Performance`, `Spotify_Weekly_Snapshot`, `Data_Source_Status` | No | Migrated. Homepage cards now use `KPI_History`, and the watchlist uses `Data_Source_Status`. |
| Top Performing Content | `/api/top-content` | `Content_Performance` | No | Retain as primary page. |
| Comparative Analysis | `/api/comparative` | `KPI_History` | No | Retain as primary page. |

## Migration Plan

1. Completed: `/api/home` now uses only the four Communications Intelligence source tables.
2. Completed: legacy routes remain available for now.
3. Completed: `/api/comms/tables` returns the four primary tables.
4. Completed: homepage UI labels now reflect `KPI_History`, not legacy `KPI Records`.
5. Completed: homepage "Recent Alerts" was replaced by a `Data_Source_Status` source-status watchlist.
6. In a later cleanup stage, remove or archive legacy sync routes and legacy table environment variables after confirming they are no longer needed.

## Post-Migration Primary Page Sources

- KPI Overview: `KPI_History`, `Spotify_Weekly_Snapshot`, `Data_Source_Status`, with content summary from `Content_Performance`.
- Top Performing Content: `Content_Performance`.
- Comparative Analysis: `KPI_History`.
