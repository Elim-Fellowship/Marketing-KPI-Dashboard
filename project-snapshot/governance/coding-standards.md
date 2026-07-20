# Coding Standards

These standards document conventions already visible in the repository and should be followed for future work.

## Naming

- Use descriptive service names ending in `Service`.
- Use connector names ending in `Connector`.
- Use Airtable table keys in camelCase, such as `spotifyEpisodeMetrics`.
- Use Airtable column names only in Airtable schema mappings, table interfaces, or read-normalization helpers.
- Use stable internal field names for backend-owned models.
- Use clear dashboard terms:
  - Communications Performance Score
  - Email Performance Score
  - Social Media Performance Score
  - Podcast Performance Score
  - Website Performance Score

## Folder Organization

- Express app setup belongs in `apps/backend/src/app.ts`.
- Server startup belongs in `apps/backend/src/server.ts`.
- Runtime configuration belongs in `apps/backend/src/config/`.
- Airtable boundary code belongs in `apps/backend/src/airtable/`.
- Airtable table interfaces belong in `apps/backend/src/types/`.
- Business and dashboard logic belongs in `apps/backend/src/services/`.
- Platform analytics normalizers belong in `apps/backend/src/services/platformAnalytics/`.
- Connector implementations belong in `apps/backend/src/connectors/`.
- File parsing and upload transformations belong in `apps/backend/src/ingestion/`.
- Static dashboard assets currently belong in `apps/backend/public/`.

## TypeScript Conventions

- Prefer explicit interfaces for shared data structures.
- Use `unknown` for untrusted input and narrow it before use.
- Avoid `any`.
- Keep optional fields marked with `?`.
- Use typed table keys and field maps for Airtable access.
- Use helper functions to parse strings, numbers, booleans, and dates.
- Keep calculations in pure functions where practical.
- Export only what other modules need.

## Service Design

- Services should have focused responsibilities.
- Constructor dependencies should be explicit.
- Services should not instantiate unrelated infrastructure internally when dependency injection is already used in `createApp()`.
- Dashboard services should return dashboard-ready data, not raw platform payloads.
- Platform services should normalize records into shared channel/dashboard metric shapes.
- Keep legacy services working unless intentionally retired.

## Connector Design

- Connectors should use the existing connector metadata structure:
  - `id`
  - `name`
  - `sourceName`
  - `category`
  - `mode`
  - `enabled`
  - `description`
- Use `BaseConnector` for standard mock/API metric flows.
- Override `sync()` only when the source requires a custom flow, such as file-based ingestion.
- Keep connector write behavior clear about dry-run versus non-dry-run execution.
- Return structured sync results.
- Do not parse uploaded files inside connectors when an ingestion layer exists.

## Error Handling

- Use `AppError` for expected validation, configuration, and Airtable errors.
- Convert internal errors to safe public errors at the route boundary.
- Keep dashboard endpoints resilient when optional integrations fail.
- Return `hasData: false` or safe empty arrays when a future platform has no records.
- Include enough context for debugging without leaking credentials.

## Logging

- Use the existing logger and child loggers.
- Log connector id, source name, status, and error summary for sync failures.
- Do not log full secrets or bearer tokens.
- Warn on Airtable schema mismatches.
- Keep request logging enabled through the existing middleware.

## Configuration

- Load configuration through `loadConfig()`.
- Keep environment variable parsing centralized in `apps/backend/src/config/env.ts`.
- Prefer defaults for table names where safe.
- Require credentials only when the feature truly cannot run without them.
- Document production-only requirements such as `SYNC_API_KEY`.

## Environment Variables

- Add new variables to `.env.example`.
- Add Render variables to `render.yaml` when they are required for deployed operation.
- Never commit real credentials.
- Use precise names:
  - platform prefix
  - purpose
  - stable uppercase format
- For alternate credential variables, document precedence clearly.

## Documentation Expectations

- Update `project-snapshot/` when architecture or data flow changes.
- Update governance docs when development rules change.
- Document Airtable fields before requiring them in code.
- Document known limitations explicitly.
- Keep old docs marked historical or update them when they become misleading.

## Validation Before Handoff

- Run TypeScript validation after code changes.
- Exercise affected local API routes when practical.
- Check that no frontend page breaks from missing data.
- Confirm no application code changed when the task is documentation-only.
