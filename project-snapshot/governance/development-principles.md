# Development Principles

These principles guide future development of the Communications Intelligence Platform. They are based on the current repository architecture and the audited project snapshot.

## Core Architecture

- Backend owns business logic.
- Frontend stays platform-agnostic.
- Airtable remains the source of truth unless an explicit architecture decision changes that.
- Preserve raw/source data whenever possible.
- Normalize data in backend services before it reaches dashboard APIs.
- Keep dashboard API contracts stable for the frontend.
- Avoid platform-specific logic in browser code.
- Prefer extending existing services and models over creating parallel implementations.

## Data Principles

- Store source data as close to the original platform shape as practical.
- Translate platform-specific field names at the Airtable boundary or in platform analytics services.
- Use typed internal models for calculations and dashboard responses.
- Make aggregation explicit: source table, date field, metric field, and grouping logic should be easy to find.
- Do not overwrite unrelated channel metrics when syncing one integration.
- Treat legacy tables as compatibility surfaces unless they are intentionally promoted again.

## Service Principles

- Keep services focused:
  - Airtable boundary services read/write Airtable.
  - Platform analytics services normalize one platform or channel family.
  - Aggregation services combine normalized outputs.
  - Dashboard services shape API responses.
- Reuse existing abstractions:
  - `AirtableClient` for raw Airtable API calls.
  - `AirtableAdapter` for schema-mapped writes.
  - `AirtableService` for cached reads.
  - `SyncManager` and connectors for ingestion orchestration.
  - KPI calculation utilities for score logic.
- Avoid duplicating metric formulas across services.
- Prefer small pure helper functions for calculations and transformations.

## Integration Principles

- Add new platforms through the connector and platform-service patterns already present.
- Build platform-specific normalization behind backend APIs, not in the frontend.
- Each integration should have a clearly documented source table, write target, dashboard usage, and sync status behavior.
- Mock connectors are acceptable during planning, but live integrations must document what is real and what remains placeholder.
- Scheduled jobs should be safe to retry and should avoid duplicate Airtable records through stable unique keys when possible.

## Frontend Principles

- The dashboard should consume normalized REST API responses.
- Frontend code should not know Airtable table names unless it is explicitly a diagnostic/debug view.
- Frontend code should not know platform-specific raw fields.
- Preserve existing page-level API contracts unless there is an intentional migration plan.
- Add new pages by adding backend API support first, then frontend rendering.

## Type Safety

- Use TypeScript interfaces for Airtable tables and dashboard response models where practical.
- Prefer internal stable field names over raw Airtable column names inside backend logic.
- Translate field names at the Airtable boundary.
- Avoid `any`; use `unknown`, narrow values, and typed helper functions.
- Keep nullable and optional values explicit.

## Operational Principles

- Do not hardcode secrets.
- All credentials and table names should come from environment variables or safe defaults.
- Keep `/health`, `/api/data-health`, and integration status endpoints useful for deployment checks.
- Log enough context to debug failures without exposing secrets.
- Production sync routes should be protected with `SYNC_API_KEY`.

## Change Discipline

- Make the smallest safe change that fits the existing architecture.
- Do not redesign unrelated pages or services while fixing one integration.
- Preserve legacy functionality unless removal is explicitly requested.
- Document known mismatches instead of hiding them.
- Update the project snapshot or governance docs when architecture changes materially.
