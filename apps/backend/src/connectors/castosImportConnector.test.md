Castos top-content import acceptance notes

- Monthly KPI_History total remains idempotent by Unique Key.
- Episode-level Content_Performance rows are idempotent by Source Record ID.
- Episode duplicates inside a single Castos CSV are aggregated by published date + podcast + episode.
- Source Name is Castos so live-data traceability checks accept the records.
- Metric Label is Listens; Metric Value is the Castos listen count for the reporting month.

This file is temporary verification documentation for the feature branch and should be removed before merge if automated coverage is added.
