# Architecture Decisions

This document records major architecture decisions visible in the current repository. It is an ADR-style living document rather than a formal immutable log.

## ADR 001: Airtable Is The Source Of Truth

Status: Accepted

Decision:
Use Airtable as the central data store for communications analytics, source status, historical KPI data, and dashboard records.

Rationale:
Airtable gives the project a visible operational database that can be inspected and edited without custom admin tooling. It also supports a staged integration approach where manual data and live API data can coexist.

Consequences:
- Backend services must tolerate missing or evolving fields.
- Airtable table schemas need documentation and validation.
- Formula, lookup, rollup, and AI-generated fields should not be written directly.
- Performance depends on caching and careful Airtable request usage.

## ADR 002: Backend Owns Normalization And Business Logic

Status: Accepted

Decision:
Keep platform-specific normalization, KPI scoring, date filtering, comparisons, and aggregation in backend services.

Rationale:
The dashboard should consume stable, dashboard-ready APIs instead of knowing each platform's raw schema. This makes it easier to add platforms without rewriting UI logic.

Consequences:
- Backend services are the primary architecture surface.
- Changes to KPI formulas belong in the KPI calculation/model layer.
- Platform raw fields should be translated before data reaches the frontend.

## ADR 003: Frontend Is Platform-Agnostic

Status: Accepted

Decision:
The current frontend is a static dashboard served by Express and should remain platform-agnostic.

Rationale:
The dashboard's job is presentation. Keeping platform knowledge in the backend prevents platform-specific UI branches and allows data sources to change independently.

Consequences:
- Browser code should call `/api/overview`, `/api/top-content`, `/api/channel-breakdown`, and related backend APIs.
- Frontend code should not depend on Airtable table names or raw source columns.
- New analytics pages should start with backend API design.

## ADR 004: Connector Pattern For Ingestion

Status: Accepted, with active inconsistency

Decision:
Use a connector framework with connector metadata, sync orchestration, dry-run support, and source status tracking.

Rationale:
Multiple platforms will need a repeatable ingestion shape: authenticate, fetch, transform, write, report status.

Consequences:
- `SyncManager` coordinates connector runs.
- `Data_Source_Status` can track sync results.
- Mock connectors allow staged platform planning.
- Current inconsistency: live Mailchimp uses `MailchimpService`, while `MailchimpConnector` remains mock-mode; Spotify uses a custom connector sync path.

## ADR 005: Schema Mapping At The Airtable Boundary

Status: Accepted

Decision:
Use internal backend field names and translate them to Airtable column names in `AIRTABLE_TABLE_SCHEMAS` and `AirtableAdapter`.

Rationale:
Airtable field names can change, and backend logic should not be scattered with raw column names for write operations.

Consequences:
- New writable fields should be added to the schema mapping.
- `AirtableAdapter` should be used for writes.
- Startup schema validation can mark unavailable fields and skip them later.
- Read-side normalization still uses tolerant field matching in several services.

## ADR 006: Weighted KPI Scoring

Status: Accepted

Decision:
Use backend-defined weighted formulas for Communications, Email, Social Media, Podcast, and Website performance scores.

Rationale:
Business-defined scores allow executive dashboard cards to be consistent and explainable across channels.

Consequences:
- Formula definitions belong in the KPI calculation/model layer.
- Score transparency should be generated from shared definitions, not duplicated in UI text.
- Future benchmark-based scoring can be added later without changing frontend contracts.

## ADR 007: Preserve Legacy Functionality During Migration

Status: Accepted

Decision:
Keep legacy KPI routes and tables available while Communications Intelligence data sources mature.

Rationale:
The project evolved from an automated KPI dashboard into a Communications Intelligence Platform. Removing legacy paths too early could break diagnostics or staged workflows.

Consequences:
- Snapshot docs must distinguish primary, legacy, and diagnostic tables.
- `Channel_Performance`, `KPI Sources`, `KPIs`, `KPI Records`, and `Import Jobs` remain configured.
- Future cleanup should be explicit and planned.

## ADR 008: Static Dashboard For Current Version

Status: Accepted for current implementation

Decision:
Serve the current dashboard from `apps/backend/public` instead of a separate React app.

Rationale:
The current implementation is simpler to deploy on Render and keeps frontend hosting out of scope while backend data architecture stabilizes.

Consequences:
- `apps/dashboard` is currently empty.
- Documentation must not imply React exists in the repo.
- A future React migration should preserve existing backend API contracts.

## ADR 009: Raw Platform Tables Over Placeholder Aggregates

Status: Emerging

Decision:
Move platform data dependencies toward raw/source tables, beginning with `Spotify_Episode_Metrics`.

Rationale:
Raw source tables preserve detail and reduce dependence on manually maintained aggregate placeholder tables.

Consequences:
- Spotify Channel Breakdown now reads `Spotify_Episode_Metrics`.
- The ingestion path still needs alignment because it currently writes `Spotify_Weekly_Snapshot`.
- Future integrations should define raw/source tables before dashboard aggregation.
