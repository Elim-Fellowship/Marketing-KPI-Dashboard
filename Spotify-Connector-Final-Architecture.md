# Spotify Connector Final Architecture

## Purpose

Spotify is the first completed platform connector for the Communications Intelligence Platform.

The purpose of this integration was not simply displaying Spotify metrics. It established the reusable architecture pattern that all future communication platform integrations should follow.

---

# Final Data Flow

Spotify Source Data

↓

Spotify Connector

↓

RawConnectorMetric[]

↓

Backend Normalization

↓

Airtable Storage

↓

KPI Services

↓

Dashboard APIs

↓

React Dashboard


The frontend never communicates directly with Spotify.

The frontend does not understand Spotify API structures or Airtable schemas.

---

# Connector Responsibilities

The Spotify connector is responsible for:

- Identifying Spotify as a communications data source
- Importing Spotify performance data
- Returning standardized metrics
- Preparing data for Airtable persistence

The connector should not contain dashboard logic.

---

# Airtable Structure

Spotify uses dedicated Airtable tables because podcast analytics require different fields than other communication channels.

Current tables:

## Spotify_Episode_Metrics

Stores:

- Episode Name
- Publish Date
- Total Streams
- Listener Metrics
- Episode Performance Data


## Spotify_Weekly_Snapshot

Stores:

- Historical KPI snapshots
- Trend information
- Reporting metrics


The dashboard never directly queries these tables.

---

# Architectural Lesson

Do not force every communication platform into the same Airtable structure.

Podcast analytics are fundamentally different from:

- Email campaigns
- Social media posts
- Website analytics

Platform-specific tables are acceptable.

The backend is responsible for normalization.

---

# Connector Pattern

Future connectors should follow:

Connector Metadata:

- id
- name
- sourceName
- category
- mode
- enabled


Connector Methods:

fetchMetrics()

Returns:

RawConnectorMetric[]


transformData()

Converts platform data into normalized metrics.


writeData()

Handles Airtable persistence.


sync()

Coordinates the full import workflow.

---

# Future Integrations

The following integrations should reuse this architecture:

- Mailchimp
- Meta
- Website Analytics
- YouTube
- Castos


Each integration should have:

- Dedicated connector
- Platform-specific import logic
- Normalized backend output
- Shared KPI calculations
- Standard dashboard objects


The dashboard should not change when new platforms are added.