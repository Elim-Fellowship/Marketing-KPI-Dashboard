# Spotify Integration Architecture Reference

## Purpose

Spotify is the first completed platform integration for the Communications Intelligence Platform.

The goal was not simply to display Spotify analytics, but to establish the reusable architecture pattern that all future integrations will follow.

---

# Final Architecture

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


The frontend never communicates directly with Spotify.

The frontend does not understand Spotify API structures or Airtable schemas.

---

# Spotify Data Flow

Spotify data enters through the Spotify Connector.

The connector is responsible for:

- Authentication/import handling
- Reading source data
- Normalizing metrics
- Returning standardized connector results

The backend handles all transformation logic.

---

# Airtable Structure

Spotify uses dedicated tables where platform-specific data requires unique structure.

Current tables:

Spotify_Episode_Metrics

Stores:

- Episode information
- Streams
- Listener metrics
- Episode performance data


Spotify_Weekly_Snapshot

Stores:

- Historical Spotify KPI snapshots
- Trend data
- Reporting metrics


The dashboard should not directly query these tables.

---

# Important Architecture Decision

Spotify originally used the generic Channel_Performance workflow.

This created issues because podcast metrics do not behave like social media metrics.

The solution was NOT redesigning Airtable.

Instead:

Spotify received its own backend data path while still exposing standardized KPI objects.

This preserves compatibility with future platforms.

---

# Connector Pattern

All future connectors should follow this model:

Connector Metadata

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

Converts raw metrics into normalized dashboard data.


writeData()

Handles Airtable persistence.


sync()

Coordinates the complete workflow.

---

# Lessons Learned

## Do not force every platform into one Airtable table

Different communication channels have different measurement models.

Spotify episodes are fundamentally different from:

- Email campaigns
- Social posts
- Website articles

Platform-specific storage is acceptable when the backend normalizes the output.

---

## Backend owns complexity

The frontend should never contain:

- Spotify-specific logic
- Airtable field names
- API response handling

All complexity belongs in backend services.

---

# Future Spotify Improvements

Remaining enhancements:

- Historical trend series
- Listener growth metrics
- Activity volume tracking
- Additional podcast KPIs
- Episode ranking improvements

---

# Pattern For Future Integrations

Mailchimp, Meta, Website Analytics, YouTube, and Castos should follow the same architecture.

Each platform gets:

- Dedicated connector
- Platform-specific import logic
- Normalized backend output
- Shared KPI calculations
- Standard dashboard objects

The dashboard remains unchanged.