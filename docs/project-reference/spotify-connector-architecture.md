# Spotify Connector Architecture Reference

## Purpose

Spotify is the first completed platform integration for the Communications Intelligence Platform.

The purpose of this integration was not simply to display Spotify analytics. It established the reusable backend connector pattern that future integrations will follow.

The dashboard architecture must remain platform-independent.

---

# Final Data Architecture

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
React Dashboard


The frontend never communicates directly with external platforms.

The frontend does not understand:

- Spotify API structures
- Airtable schemas
- External platform response formats

All transformation and normalization happens in backend services.

---

# Spotify Integration Pattern

Spotify data flows through the Spotify Connector.

The connector is responsible for:

- Importing Spotify data
- Reading source metrics
- Normalizing metrics
- Returning standardized connector results
- Writing data through backend services

The backend owns all platform-specific complexity.

---

# Airtable Structure

Spotify uses dedicated Airtable tables because podcast analytics require a different data model than other communication channels.

Current tables:

## Spotify_Episode_Metrics

Stores:

- Episode information
- Episode performance metrics
- Stream data
- Listener metrics


## Spotify_Weekly_Snapshot

Stores:

- Historical Spotify KPI snapshots
- Trend data
- Reporting metrics


The dashboard should never directly query these tables.

---

# Important Architecture Decision

Spotify originally attempted to use the generic Channel_Performance workflow.

This caused problems because podcast analytics are fundamentally different from social media analytics.

The solution was not redesigning Airtable.

Instead:

Spotify received a dedicated backend data path while still returning standardized KPI objects.

This approach preserves compatibility with future integrations.

---

# Connector Pattern

Every future integration should follow this model.

## Connector Metadata

Each connector defines:

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

Coordinates the complete connector workflow.

---

# Lessons Learned

## Do Not Force Every Platform Into One Table

Different communication channels measure different things.

Examples:

Spotify:
- Episodes
- Streams
- Listener retention


Mailchimp:
- Campaigns
- Opens
- Clicks


Social Media:
- Posts
- Reach
- Engagement


Each platform may require its own Airtable structure.

The backend is responsible for creating consistency.

---

# Backend Owns Complexity

The frontend should never contain:

- Spotify-specific logic
- Airtable field names
- API response handling
- Platform-specific calculations


All complexity belongs inside backend services.

---

# Future Spotify Enhancements

Remaining improvements:

- Historical trend series
- Listener growth metrics
- Activity volume tracking
- Additional podcast KPIs
- Improved episode ranking

---

# Future Integration Template

Future integrations should follow the same architecture:

Each platform receives:

- Dedicated connector
- Platform-specific import logic
- Normalized backend output
- Shared KPI calculations
- Standard dashboard objects


Future integrations:

- Mailchimp
- Meta
- Website Analytics
- YouTube
- Castos
- Buffer


The dashboard should remain unchanged as new platforms are added.