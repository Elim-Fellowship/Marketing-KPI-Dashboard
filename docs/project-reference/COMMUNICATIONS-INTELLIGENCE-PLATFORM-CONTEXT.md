# Communications Intelligence Platform – Atlas Project Context

## Project Purpose

The Communications Intelligence Platform is a centralized communications analytics and KPI dashboard built for the Communications Department.

The goal is to create a single source of truth for communications performance by consolidating data from every communication channel into one executive dashboard.

The platform is designed to move beyond disconnected reports and isolated platform metrics. Instead, it transforms communications activity into actionable intelligence through normalized data, KPI scoring, historical reporting, and cross-channel analysis.

The system will integrate:

- Mailchimp
- Meta (Facebook and Instagram)
- Spotify
- Castos
- Website Analytics
- YouTube
- Future communication platforms

Each platform maintains its own data source while the backend creates standardized KPI objects consumed by the dashboard.

---

# Core Architecture

The platform follows a four-layer architecture.

## Layer 1 – External Data Sources

Each communication platform remains its own system of record.

Examples:

- Mailchimp Marketing API
- Spotify CSV/API
- Meta APIs
- Website Analytics
- YouTube Analytics
- Castos

The goal is to eliminate manual reporting whenever possible.

---

## Layer 2 – Airtable Database

Airtable functions as the centralized analytics database.

Responsibilities:

- Store imported analytics
- Preserve historical records
- Maintain normalized datasets
- Store platform-specific source data when required

Examples:

- Spotify_Episode_Metrics
- Spotify_Weekly_Snapshot
- KPI_History
- Content_Performance
- Monthly_Activity_Summary
- Channel_Performance

Platform-specific tables are acceptable when platforms measure fundamentally different things.

The backend is responsible for normalization.

---

## Layer 3 – Backend Services

The Node.js / TypeScript backend owns all business logic.

Responsibilities:

- Connect to external APIs
- Read Airtable data
- Normalize platform data
- Calculate KPIs
- Create dashboard-ready objects
- Manage connector workflows
- Expose REST API endpoints

The frontend should never understand:

- Airtable schemas
- External API structures
- Platform-specific fields
- CSV formats

All complexity belongs in backend services.

---

## Layer 4 – Dashboard

The React dashboard displays executive communications intelligence.

Primary pages:

- KPI Overview
- Top Performing Content
- Channel Breakdown

The dashboard focuses on:

- Trends
- Health scores
- Growth
- Strategic insights
- Cross-channel comparisons

It should not display raw platform reporting.

---

# Development Philosophy

The platform follows these principles:

1. Preserve raw source data whenever possible.

2. Normalize data in the backend.

3. Keep the frontend platform agnostic.

4. Build reusable connector services.

5. Avoid redesigning Airtable for individual integrations.

6. Maintain compatibility with future APIs.

7. Prefer scalable architecture over one-off fixes.

---

# KPI Model

The dashboard measures communications performance rather than isolated platform statistics.

Current primary KPI:

## Communications Performance Score

Calculated from:

- Email Performance Score
- Social Media Performance Score
- Podcast Performance Score
- Website Performance Score

Each category uses weighted metrics based on organizational priorities.

The purpose is to convert activity data into meaningful organizational performance indicators.

---

# Connector Architecture

All integrations follow the same connector pattern.

Each connector contains:

## Metadata

- id
- name
- sourceName
- category
- mode
- enabled

## Connector Workflow

fetchMetrics()

↓

transformData()

↓

writeData()

↓

sync()

The connector receives source data, converts it into normalized metrics, and allows backend services to calculate KPIs.

---

# Spotify Integration Reference

Spotify was the first completed platform integration.

The purpose was not only to display Spotify analytics, but to establish the architecture pattern all future integrations should follow.

---

# Spotify Data Flow

Spotify follows:

External Platform

↓

Spotify Connector

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


The frontend never communicates directly with Spotify.

---

# Spotify Architecture Decision

Originally, Spotify metrics were imported successfully into Airtable.

However, the dashboard was still reading Spotify performance through the generic:

Channel_Performance

workflow.

The actual data existed in:

Spotify_Episode_Metrics

This caused Spotify dashboards to return:

- metricValue: 0
- activityVolume: 0
- hasData: false

The issue was not the import.

The issue was the backend data path.

---

# Spotify Solution

The solution was NOT redesigning Airtable.

Instead:

Spotify received its own backend data path while continuing to expose standardized dashboard objects.

Key principle:

Platform-specific storage is acceptable.

Platform-specific frontend logic is not.

---

# Spotify Airtable Structure

## Spotify_Episode_Metrics

Purpose:

Stores episode-level Spotify performance data.

Contains:

- Episode Name
- Publish Date
- Total Streams
- Listener metrics
- Engagement metrics
- Performance calculations


## Spotify_Weekly_Snapshot

Purpose:

Stores historical Spotify KPI snapshots.

Contains:

- Reporting periods
- KPI trends
- Historical performance measurements

---

# Spotify Backend Implementation

Completed changes:

- Added Spotify Airtable configuration
- Added SpotifyEpisodeMetricsFields TypeScript model
- Registered Spotify tables
- Updated Spotify connector architecture
- Created dedicated Spotify data loading path
- Maintained normalized dashboard output

Spotify now provides:

- Total Streams
- KPI values
- Trend information
- Correct Airtable source mapping

---

# Spotify Lessons Learned

Do not force every communication platform into one generic Airtable structure.

Different platforms measure different things.

Spotify episodes are fundamentally different from:

- Email campaigns
- Social posts
- Website articles
- YouTube videos

Dedicated source tables are acceptable.

Backend normalization is required.

---

# Mailchimp Integration Reference

Mailchimp serves as the primary email communications data source.

The objective:

Automatically retrieve email performance metrics through the Mailchimp Marketing API, normalize them into Airtable, and power dashboard KPIs without manual imports.

---

# Mailchimp Architecture

Mailchimp Marketing API

↓

Backend Import Service

↓

Airtable

↓

Communications Analytics Services

↓

Dashboard APIs

↓

Dashboard UI


The frontend never communicates directly with Mailchimp.

---

# Mailchimp Authentication

Required configuration:

- API Key
- Data Center
- Audience ID

Credentials are stored through environment variables.

API endpoint:

https://<dc>.api.mailchimp.com/3.0/

Authentication:

Basic Authentication

Username:
Any string

Password:
API Key

---

# Mailchimp Airtable Strategy

Mailchimp should populate existing normalized tables whenever possible.

Primary destinations:

- KPI_History
- Content_Performance
- Monthly_Activity_Summary

A Mailchimp-specific reporting table should only be created if future API complexity requires it.

---

# Mailchimp Metrics

Campaign metrics:

- Campaign Name
- Campaign ID
- Send Date
- Subject Line
- Audience

Performance metrics:

- Emails Sent
- Opens
- Unique Opens
- Open Rate
- Clicks
- Unique Clicks
- Click Rate
- Bounce Rate
- Unsubscribes
- Spam Complaints

Audience metrics:

- Total Subscribers
- New Subscribers
- Subscriber Growth
- Cleaned Addresses

Derived metrics:

- Open Rate
- Click Rate
- Click-to-Open Rate
- Subscriber Growth Rate
- Unsubscribe Rate

---

# Email Performance Score

Mailchimp contributes to:

Email Performance Score

Example weighting:

- 40% Click Rate
- 30% Open Rate
- 20% Subscriber Growth
- 10% Unsubscribe Rate Health

---

# Executive Summary Integration

Mailchimp contributes:

- Emails Sent
- Average Open Rate
- Average Click Rate
- Subscriber Growth
- Audience Size

These combine with:

- Podcast Production
- Website Activity
- Social Media Activity

to create communications reporting.

---

# Future Integrations

Future platforms should follow the same pattern:

## Meta

Dedicated connector

↓

Platform-specific import logic

↓

Normalized KPI objects


## Website Analytics

Dedicated connector

↓

Backend normalization

↓

Shared KPI calculations


## YouTube

Dedicated connector

↓

Normalized video metrics

↓

Dashboard reporting


## Castos

Dedicated connector

↓

Podcast hosting metrics

↓

Unified podcast analytics

---

# Long-Term Vision

The Communications Intelligence Platform is not intended to become a collection of individual platform dashboards.

The objective is:

Platform Data

↓

Backend Intelligence

↓

Normalized KPIs

↓

Executive Dashboard


The final product should provide:

- Automated reporting
- Historical trends
- Cross-channel comparisons
- Campaign attribution
- AI-generated insights
- Predictive communications analytics

The platform should continue growing without requiring redesign of the dashboard architecture.