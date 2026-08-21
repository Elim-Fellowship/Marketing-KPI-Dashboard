# Castos Top Content Implementation

This feature preserves episode-level Castos listens from monthly CSV imports in `Content_Performance` while retaining the existing monthly aggregate in `KPI_History`.

Key behavior:

- Monthly KPI totals remain idempotent by `Unique Key`.
- Episode-level rows are idempotent by `Source Record ID`.
- Duplicate rows within a Castos CSV are aggregated by publish date, podcast, and episode.
- Episode records retain source provenance (`Source Name = Castos`) and the source-native metric label (`Listens`).
- Existing Spotify episode data remains available as a fallback until Castos history is backfilled and the Top Content source-selection rule is finalized.
