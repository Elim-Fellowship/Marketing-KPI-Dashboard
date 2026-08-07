# KPI-028 — Live Top Performing Content Validation

## Purpose

Validate that `/api/top-content` returns only traceable live analytics and never substitutes seeded, mock, hardcoded, or placeholder content.

## Expected production sources

- Spotify episode analytics from `Spotify_Episode_Metrics`
- Buffer social post analytics from `Buffer_Post_Metrics`
- Future content-level records from `Content_Performance` only when they contain explicit source provenance (`Source Name`/`Source` plus `Source Record ID`/`Unique Key`)

Current content-level sources not yet available to this page must be reported as unavailable rather than fabricated: Mailchimp campaign content, YouTube, Website, and Castos.

## Validation procedure

1. Request `/api/top-content?timeframe=all&platform=all&groupBy=none`.
2. Confirm `dataState` is `partial` until all expected content-level integrations are available.
3. Confirm `liveDataSummary.sources` contains only sources represented by traceable records.
4. Confirm every `topOverall` item has a non-empty `title`, `platform`, `date`, `metricLabel`, `metricUnit`, `sourceName`, and `sourceRecordId`, and a finite numeric `metricValue`.
5. Confirm no known legacy/demo `Content_Performance` titles appear. The current exported legacy table should be counted in `excludedLegacyContentPerformanceRows` rather than ranked.
6. Match a Spotify item back to the Airtable `Spotify_Episode_Metrics` record identified by `sourceRecordId`; confirm title, publish date, and Total Streams match.
7. Match a Buffer item back to `Buffer_Post_Metrics` using `sourceRecordId`; confirm content title, channel, metric date, metric label, metric value, and unit match.
8. Confirm duplicate `(sourceName, sourceRecordId, metricLabel)` combinations do not appear.
9. Repeat with `timeframe=30d`, `90d`, and `365d`; confirm every returned date is inside the requested period.
10. Repeat with each value returned in `platforms`; confirm every result matches the selected platform/channel.
11. Select a filter with no matching live records; confirm `dataState=empty`, `topOverall=[]`, and the frontend displays an honest no-data state.
12. Confirm browser network traffic for the page uses `/api/top-content` and does not call Spotify, Buffer, Mailchimp, or Airtable directly.

## Export-based validation snapshot — August 7, 2026

Using the supplied Airtable CSV exports:

- 31 legacy `Content_Performance` rows are excluded because they do not contain required production provenance.
- 46 Spotify episode rows pass live-record validation.
- 10 Buffer metric rows pass live-record validation.
- 56 traceable live records are available for all-time ranking before filters.
- The 90-day window contains 10 Buffer records and no Spotify records because the latest Spotify episode in the export is April 29, 2026.
- A 30-day Spotify-only filter returns zero records and must render the empty state.
