# Spotify Integration Snapshot

## Purpose

Spotify is the first completed platform integration for the Communications Intelligence Platform.

The purpose was not only to display Spotify analytics, but to establish the reusable architecture pattern that future integrations will follow.

Future integrations:
- Mailchimp
- Meta
- Website
- YouTube
- Castos
- Buffer

should follow this same model.

---

# Architecture

External Platform

↓

Backend Connector

↓

Normalized Metrics

↓

Airtable

↓

KPI Services

↓

Dashboard APIs

↓

Frontend


The frontend never communicates directly with external platforms.

The frontend never depends on:
- Airtable schemas
- External API structures
- Platform-specific fields

---

# Spotify Data Flow

Spotify data enters through the Spotify connector.

The connector is responsible for:

- Import handling
- Reading source data
- Normalizing metrics
- Returning standardized connector results

The backend owns transformation and business logic.

---

# Airtable Design

Spotify uses dedicated Airtable tables.

## Spotify_Episode_Metrics

Stores episode-level performance data.

Examples:
- Episode name
- Streams
- Listener metrics
- Episode performance information


## Spotify_Weekly_Snapshot

Stores historical KPI snapshots.

Examples:
- Weekly streams
- Trend metrics
- Historical reporting data


The dashboard does not directly query these tables.

---

# Architecture Decision

Spotify was originally considered for the generic Channel Performance workflow.

This was rejected because podcast analytics are fundamentally different from other communication channels.

The solution:

Keep platform-specific storage where necessary.

Normalize the output in backend services.

Do not redesign Airtable for every integration.

---

# Connector Pattern

Every future integration should implement:

## Metadata

- id
- name
- sourceName
- category
- mode
- enabled


## Connector Methods

fetchMetrics()

Returns:

RawConnectorMetric[]


transformData()

Converts platform data into normalized metrics.


writeData()

Handles persistence.


sync()

Coordinates the complete workflow.

---

# Files Modified During Spotify Integration

Backend:

- src/config/env.ts
- src/connectors/spotifyConnector.ts
- src/connectors/types.ts
- src/services/dataSourceStatusModel.ts
- src/services/syncManager.ts
- src/types/airtableTables.ts


---

# Current Status

Spotify integration architecture is complete.

The backend builds successfully.

The connector pattern is ready to be reused.

---

# Future Work

Remaining Spotify enhancements:

- Historical trend series
- Listener growth metrics
- Activity volume tracking
- Additional podcast KPIs
- Improved episode ranking


---

# Rule For Future Integrations

Do not create platform-specific frontend logic.

Do not force every platform into the same Airtable table.

Each integration should have:

- Dedicated connector
- Platform-specific ingestion
- Normalized backend metrics
- Shared KPI calculations
- Standard dashboard objects


The dashboard should remain unchanged as integrations are added.