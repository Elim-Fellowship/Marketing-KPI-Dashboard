# Communications Intelligence Platform - Development Instructions

## Project Purpose

This repository contains the Communications Intelligence Platform.

The goal is to create a centralized communications analytics dashboard that aggregates data from:

- Mailchimp
- Meta
- Spotify
- Castos
- Website Analytics
- YouTube
- Future communication platforms

The platform provides executive-level KPIs, historical reporting, cross-channel comparisons, and automated data imports.

---

# Architecture Rules

The system follows this architecture:

External Platforms

↓

Backend Connectors

↓

Normalized Metrics

↓

Airtable

↓

Backend KPI Services

↓

Dashboard APIs

↓

React Frontend


The frontend must remain platform agnostic.

Never expose:
- Airtable schemas
- External API structures
- Platform-specific logic

to frontend components.

---

# Backend Responsibilities

The backend owns:

- API integrations
- Data normalization
- KPI calculations
- Business logic
- Airtable interaction
- Metric transformations
- Historical snapshots

Prefer solving complexity in backend services instead of frontend workarounds.

---

# Airtable Rules

Airtable is the analytics data warehouse.

Preserve raw source data whenever possible.

Do not redesign Airtable for a single integration.

Platform-specific tables are acceptable when platforms have different measurement models.

Example:

Spotify uses:
- Spotify_Episode_Metrics
- Spotify_Weekly_Snapshot

because podcast analytics differ from email or social analytics.

---

# Connector Pattern

All future integrations should follow the Spotify connector pattern.

Each connector should contain:

Metadata:

- id
- name
- sourceName
- category
- mode
- enabled


Core methods:

fetchMetrics()

Returns raw platform metrics.


transformData()

Converts platform data into normalized metrics.


writeData()

Handles persistence.


sync()

Coordinates the complete workflow.

---

# Adding New Integrations

When adding a new platform:

DO NOT:

- Add platform logic to frontend
- Create duplicate KPI calculations
- Bypass backend normalization
- Force data into unrelated Airtable tables


DO:

- Create a dedicated connector
- Add typed interfaces
- Add Airtable configuration
- Normalize output
- Reuse existing KPI services

---

# KPI Philosophy

The dashboard measures communications performance, not individual platform activity.

Primary KPIs:

- Communications Performance Score
- Email Performance Score
- Social Media Performance Score
- Podcast Performance Score
- Website Performance Score

Metrics should become inputs into standardized KPI objects.

---

# Code Quality Rules

Prefer:

- TypeScript types
- Reusable services
- Existing architecture patterns
- Minimal duplication
- Clear separation of concerns

Avoid:

- any unless necessary
- frontend-specific fixes for backend problems
- one-off integration hacks

---

# Current Integration Status

Completed:

- Dashboard architecture
- Airtable foundation
- Backend framework
- KPI scoring model
- Spotify integration


In progress:

- Mailchimp API integration


Future:

- Meta
- Website Analytics
- YouTube
- Castos
- Campaign Intelligence
- AI-generated insights

---

# Important Lessons

Spotify established the pattern for future integrations.

The solution was not redesigning Airtable.

The solution was:

- Dedicated platform ingestion
- Backend normalization
- Standardized dashboard output

Future integrations should follow this approach.