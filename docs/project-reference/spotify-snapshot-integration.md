# Spotify Integration Reference

## Purpose

Spotify was the first completed platform connector and establishes the architecture pattern for all future communication platform integrations.

The goal is not to create platform-specific dashboards.

The goal is to convert platform data into standardized communications intelligence metrics.

---

# Architecture Pattern

External Platform
        ↓
Backend Connector
        ↓
RawConnectorMetric[]
        ↓
Normalized Metrics
        ↓
Airtable Storage
        ↓
KPI Calculation Services
        ↓
Dashboard APIs
        ↓
React Dashboard


The frontend must never understand:
- Spotify API structures
- Airtable schemas
- Platform-specific fields

All platform complexity belongs in backend services.

---

# Spotify Airtable Tables

## Spotify_Episode_Metrics

Purpose:
Stores episode-level Spotify performance data.

Examples:
- Episode name
- Publish date
- Streams
- Listener metrics
- Episode performance

---

## Spotify_Weekly_Snapshot

Purpose:
Stores historical Spotify KPI snapshots.

Examples:
- Total streams
- Listener growth
- Performance trends
- Historical reporting metrics

---

# Connector Pattern

Every platform connector should follow this structure.

## Connector Metadata

Required:

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

Converts platform-specific data into normalized metrics.


writeData()

Handles Airtable persistence.


sync()

Coordinates the complete workflow.

---

# Important Lessons

Do not force every platform into the same Airtable structure.

Spotify data behaves differently than:

- Email campaigns
- Social media posts
- Website analytics
- Video platforms

Platform-specific storage is acceptable.

The backend should normalize the output.

---

# Future Integrations

Future connectors should copy this pattern:

- Mailchimp
- Meta
- Buffer
- Website Analytics
- YouTube
- Castos

Each platform should have:

- Dedicated connector
- Platform-specific import logic
- Normalized metrics
- Shared KPI calculations
- Standard dashboard objects

---

# Current Spotify Status

Completed:

✓ Dedicated Spotify data path
✓ Airtable integration
✓ Connector architecture
✓ KPI compatibility
✓ Dashboard visibility
✓ Historical snapshot support

Remaining enhancements:

- Listener growth metrics
- Activity volume
- Additional podcast KPIs
- Advanced trend reporting