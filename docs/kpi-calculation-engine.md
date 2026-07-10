# KPI Calculation Engine

The Communications Intelligence Platform uses `apps/backend/src/services/kpiCalculationEngine.ts` as the single source of truth for dashboard score formulas, component weights, and growth calculations.

## Scoring Rules

All performance scores return a 0-100 value.

- Percentage inputs are clamped to 0-100.
- Growth inputs are converted to a score with `50 + growth percentage`, then clamped to 0-100.
- Lower-is-better percentage inputs, such as unsubscribe rate, use `100 - value`.
- Volume inputs use a relative volume score: `value / reference value * 100`. Until formal benchmarks are defined, the reference value is the largest comparable component in that score.

## Communications Performance Score

Formula:

```text
Communications Performance Score =
(
  Email Performance Score +
  Social Media Performance Score +
  Podcast Performance Score +
  Website Performance Score
) / 4
```

Weights:

- Email Performance Score: 25%
- Social Media Performance Score: 25%
- Podcast Performance Score: 25%
- Website Performance Score: 25%

Example:

```text
(82 + 75 + 84 + 68) / 4 = 77.3
```

## Email Performance Score

Inputs:

- Open Rate
- Click Rate
- Subscriber Growth
- Unsubscribe Rate

Formula:

```text
Email Performance Score =
(Click Rate score * 40%)
+ (Open Rate score * 30%)
+ (Subscriber Growth score * 20%)
+ (Unsubscribe Rate Health score * 10%)
```

Weighting recommendation:

- Click Rate: 40%
- Open Rate: 30%
- Subscriber Growth: 20%
- Unsubscribe Rate Health: 10%

Example:

```text
(18 click rate * 40%)
+ (42 open rate * 30%)
+ (56 subscriber growth score * 20%)
+ (99 unsubscribe health * 10%)
= 40.9
```

## Social Media Performance Score

Inputs:

- Posts Published
- Likes
- Comments
- Shares

Formula:

```text
Social Media Performance Score =
(Posts Published score * 20%)
+ (Likes score * 30%)
+ (Comments score * 25%)
+ (Shares score * 25%)
```

Weighting recommendation:

- Posts Published: 20%
- Likes: 30%
- Comments: 25%
- Shares: 25%

Example:

```text
With relative volume scores of:
Posts Published = 20
Likes = 100
Comments = 24
Shares = 12

(20 * 20%) + (100 * 30%) + (24 * 25%) + (12 * 25%) = 43
```

## Podcast Performance Score

Inputs:

- Streams
- Podcasts Published
- Listener Growth

Derived input:

```text
Streams Per Episode = Streams / Podcasts Published
```

Formula:

```text
Podcast Performance Score =
(Listener Growth score * 40%)
+ (Streams Per Episode score * 40%)
+ (Streams score * 20%)
```

Weighting recommendation:

- Listener Growth: 40%
- Streams Per Episode: 40%
- Streams: 20%

Example:

```text
(58 listener growth score * 40%)
+ (100 streams per episode score * 40%)
+ (100 streams score * 20%)
= 83.2
```

## Website Performance Score

Inputs:

- Visitors
- Clicks
- Engagement

Formula:

```text
Website Performance Score =
(Visitors score * 40%)
+ (Clicks score * 35%)
+ (Engagement score * 25%)
```

Weighting recommendation:

- Visitors: 40%
- Clicks: 35%
- Engagement: 25%

Example:

```text
(100 visitor score * 40%)
+ (18 click score * 35%)
+ (64 engagement score * 25%)
= 62.3
```

## Growth Indicators

Growth indicators use:

```text
Growth % = (current value - previous value) / absolute previous value * 100
```

Tracked indicators:

- New Followers
- New Subscribers
- New Podcast Listeners
- Website Visitors
- Content Published

Example:

```text
New Followers current = 240
New Followers previous = 200

(240 - 200) / 200 * 100 = 20%
```

## Airtable Fields Required

The current integration uses tolerant placeholder mappings. Final integrations should standardize these fields.

For `KPI_History`:

- `KPI`, `KPI Name`, `Metric`, or `Name`
- `Value`, `Metric Value`, `Current Value`, or `Amount`
- `Date`, `Reporting Date`, `Period`, `Month`, or `Week`
- `Unit` or `Format`

Recommended KPI names:

- `Email Open Rate`
- `Email Click Rate`
- `Subscriber Growth`
- `Unsubscribe Rate`
- `Posts Published`
- `Likes`
- `Comments`
- `Shares`
- `Streams`
- `Podcasts Published`
- `Listener Growth`
- `Website Visitors`
- `Website Clicks`
- `Website Engagement`
- `New Followers`
- `New Subscribers`
- `New Podcast Listeners`
- `Content Published`

For `Content_Performance`:

- `Platform`, `Channel`, or `Source`
- `Content Type`, `Type`, or `Format`
- `Published At`, `Publish Date`, `Date`, or `Created At`
- `Likes`, `Comments`, `Shares`, `Clicks`, `Views`, `Streams`, or `Downloads`

For `Spotify_Weekly_Snapshot`:

- `Date`, `Week`, or `Snapshot Date`
- `Streams`, `Listeners`, `Downloads`, `Plays`, or `Value`

## Integration Notes

- KPI Overview reads score definitions and growth calculations from the engine.
- Channel Breakdown uses the engine for selected-period versus previous-period percentage changes.
- Future API integrations should populate canonical metric names and optional benchmark/reference values to replace relative volume scoring.
