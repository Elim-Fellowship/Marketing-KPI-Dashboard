# Platform Integration Checklist

Use this checklist for every new communications platform integration.

## Planning

- Identify the platform and owner.
- Define the business questions the integration should answer.
- Identify the dashboard pages affected.
- Decide whether the data is raw source data, reporting data, or both.
- Choose the Airtable source table.
- Define the expected refresh frequency.
- Decide whether the integration is live API, manual upload, semi-automated, or future placeholder.
- Check whether an existing connector or platform analytics service can be extended.

## Authentication

- Identify required credentials and scopes.
- Add environment variables to `.env.example`.
- Add configuration loading in `apps/backend/src/config/env.ts` only when implementation begins.
- Do not hardcode secrets.
- Document credential format and where it should be stored locally and in Render.
- Confirm whether production sync requires `SYNC_API_KEY`.
- Add a status check that can report configured versus missing credentials without exposing secret values.

## Connector

- Register the connector through the existing connector framework when applicable.
- Implement or extend the standard connector lifecycle:
  - `authenticate()`
  - `fetchMetrics()`
  - `transformData()`
  - `writeToAirtable()`
  - `sync()`
- Use `SyncManager` for orchestration when possible.
- Ensure dry-run behavior is clear.
- Ensure sync results include records fetched, prepared, written, skipped, and errors.
- Persist `Data_Source_Status` when running non-dry-run syncs.

## Normalization

- Define the raw platform fields.
- Define the internal normalized fields.
- Define date fields and timezone assumptions.
- Define metric fields and units.
- Define aggregation behavior:
  - sum
  - average
  - weighted average
  - latest value
  - count
- Define previous-period comparison behavior.
- Handle missing fields gracefully.
- Avoid platform-specific hacks in shared dashboard code.

## Airtable

- Add or confirm the Airtable table name.
- Add the table key to `AppConfig` and `AirtableTableKey` when needed.
- Add a TypeScript interface for the table.
- Add field mappings in `AIRTABLE_TABLE_SCHEMAS` for write targets.
- Use `AirtableAdapter` for schema-mapped writes.
- Use `AirtableService` for cached reads.
- Define unique-key behavior for upserts when possible.
- Avoid writing formula, lookup, rollup, or AI-generated Airtable fields directly.
- Update `/api/data-health` checks when the table becomes dashboard-critical.

## Services

- Prefer extending an existing platform analytics service if the platform fits:
  - Email
  - Social
  - Website
  - Podcast/streaming
- Create a new service only when there is a distinct platform model or repeated logic to isolate.
- Normalize source rows into dashboard-ready metrics before aggregation.
- Keep KPI scoring inside the KPI calculation layer.
- Keep dashboard response shaping inside dashboard analytics services.

## Dashboard

- Preserve existing REST API response contracts.
- Do not add raw Airtable fields to frontend logic.
- Add new frontend display only after backend data is normalized.
- If no data exists, return `hasData: false` or an empty series rather than placeholder values.
- Confirm that the relevant dashboard page still renders when the platform API fails.

## Testing

- Test missing environment variables.
- Test authentication failure.
- Test empty API responses.
- Test missing Airtable fields.
- Test duplicate prevention or upsert behavior.
- Test date filtering and previous-period calculations.
- Test dashboard API response shape.
- Test dry-run and non-dry-run sync behavior.
- Run TypeScript validation before handoff.

## Automation

- Decide whether the integration runs by:
  - manual endpoint
  - Render cron job
  - uploaded file
  - scheduled API sync
- Confirm retry safety.
- Confirm rate-limit behavior.
- Confirm logs and sync status are enough for production debugging.
- Document the exact Render job or endpoint setup.

## Documentation

- Update the project snapshot when architecture changes materially.
- Update Airtable field documentation.
- Document environment variables and credential setup.
- Document sync endpoint usage.
- Document dashboard data source usage.
- Document known limitations and manual steps.

## Definition Of Done

- Credentials are loaded through environment variables.
- Source data is written to or read from the correct Airtable table.
- Data is normalized in backend services.
- Dashboard APIs return stable, platform-agnostic JSON.
- Empty or failed integrations do not break dashboard rendering.
- Duplicate records are avoided where records are written repeatedly.
- `/api/data-health` reflects critical table availability.
- Sync status is observable.
- TypeScript validation passes.
- Documentation is updated.
