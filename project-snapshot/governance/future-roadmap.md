# Future Roadmap

This roadmap is based on the audited project snapshot and current repository state. It should be treated as a living plan.

## Immediate

1. Align Spotify ingestion with dashboard usage.
   - Dependency: confirm whether `Spotify_Episode_Metrics` is the permanent raw source table.
   - Work: update Spotify CSV transformation and connector writes so imports populate the same table used by Channel Breakdown.

2. Fix snapshot generator precision issues.
   - Dependency: none.
   - Work: improve import/consumer detection, remove helper modules from connector tables, and document route body/auth behavior.

3. Update stale root and historical docs.
   - Dependency: current audit findings.
   - Work: correct references that still describe `Spotify_Weekly_Snapshot` or `Channel_Performance` as primary dashboard sources.

4. Verify deployment environment variables.
   - Dependency: current Render configuration.
   - Work: ensure newer table variables such as `AIRTABLE_TABLE_SPOTIFY_EPISODE_METRICS`, `AIRTABLE_TABLE_CHANNEL_PERFORMANCE`, and `AIRTABLE_TABLE_MONTHLY_ACTIVITY_SUMMARY` are configured or intentionally using defaults.

5. Add focused validation tests.
   - Dependency: choose test runner.
   - Work: cover Airtable mapping, Spotify transform, Channel Breakdown response shape, and Mailchimp config/status behavior.

## Next

1. Standardize integration architecture.
   - Depends on: Spotify ingestion alignment.
   - Work: decide whether live integrations should use connector classes, standalone services, or a documented hybrid.

2. Persist sync history consistently.
   - Depends on: integration architecture decision.
   - Work: extend `Data_Source_Status` or add a sync history table so connector runs are visible beyond in-memory status.

3. Harden `/api/ingestion/sync`.
   - Depends on: integration architecture decision.
   - Work: document and test multipart handling, raw CSV handling, `dryRun`, and auth behavior.

4. Build a raw/source table pattern for each future platform.
   - Depends on: Airtable schema decisions.
   - Work: define Mailchimp, Castos, YouTube, Website, Instagram, Facebook, and Buffer source tables or confirm existing tables are sufficient.

5. Add dashboard contract tests.
   - Depends on: stable API response contracts.
   - Work: verify `/api/overview`, `/api/top-content`, `/api/channel-breakdown`, and `/api/data-health` under empty and populated data scenarios.

## Later

1. Implement Castos live integration.
   - Depends on: connector architecture standard and raw table decision.
   - Goal: podcast hosting downloads, episode activity, and publishing output.

2. Implement YouTube live integration.
   - Depends on: authentication and raw table decision.
   - Goal: video views, engagement, and publishing metrics.

3. Implement Website Analytics integration.
   - Depends on: analytics provider decision.
   - Goal: visitors, clicks, engagement, resource downloads, and form submissions.

4. Implement Meta integrations for Instagram and Facebook.
   - Depends on: Meta app/auth setup and platform field mapping.
   - Goal: impressions, likes, comments, shares, audience growth, and content volume.

5. Add production observability.
   - Depends on: scheduled integrations.
   - Goal: clearer logs, failed-sync alerts, schema drift reporting, and data freshness checks.

## Future Vision

1. Dedicated frontend workspace.
   - Depends on: decision to migrate from static dashboard to React.
   - Goal: keep backend APIs stable while moving UI into `apps/dashboard` or another frontend host.

2. Canonical platform analytics model.
   - Depends on: several real integrations.
   - Goal: every platform service returns a shared normalized shape for dashboard aggregation.

3. Historical backfill and reconciliation tools.
   - Depends on: stable raw/source tables.
   - Goal: import historical data, detect duplicate/missing records, and reconcile source totals against dashboard totals.

4. Data quality scoring.
   - Depends on: production integrations and data-health maturity.
   - Goal: measure freshness, completeness, schema health, and source reliability.

5. Governance-driven development workflow.
   - Depends on: team adoption.
   - Goal: every integration follows the checklist, updates docs, includes validation, and preserves frontend/API contracts.
