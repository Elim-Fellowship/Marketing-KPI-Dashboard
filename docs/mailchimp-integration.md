# Mailchimp Integration

Backend-only integration that pulls email analytics from Mailchimp and writes canonical email KPI rows into `KPI_History`.

## Environment Variables

```text
MAILCHIMP_API_KEY=your_mailchimp_api_key
MAILCHIMP_SERVER_PREFIX=us9
MAILCHIMP_AUDIENCE_ID=your_audience_id
```

Do not commit real Mailchimp credentials to the repository. Set them in local `.env` or Render environment variables.

## Endpoints

```text
GET /api/integrations/mailchimp/sync
GET /api/integrations/mailchimp/status
```

Sync supports an optional period selector:

```text
GET /api/integrations/mailchimp/sync?periodType=weekly
GET /api/integrations/mailchimp/sync?periodType=monthly
GET /api/integrations/mailchimp/sync?periodType=both
```

Default behavior is `periodType=both`, which processes:

- Previous completed ISO week
- Previous completed calendar month

## Mailchimp Data Read

The integration reads:

- Campaigns from `/campaigns`
- Campaign reports from `/reports/{campaign_id}`
- Audience info from `/lists/{list_id}`
- Audience activity from `/lists/{list_id}/activity`

## Metrics Written to KPI_History

For each weekly and monthly reporting period, the integration writes one row per metric:

- `Emails Sent`
- `Email Open Rate`
- `Email Click Rate`
- `New Subscribers`
- `Total Subscribers`
- `Unsubscribes`
- `Subscriber Growth`
- `Unsubscribe Rate`

All rows use:

- `Channel = Email`
- `Platform = Mailchimp`
- `Source Name = Mailchimp`

## Upsert Rule

Rows are upserted by `Unique Key`.

The key includes:

- Source
- Metric key
- Period type
- Snapshot date
- Week number
- Period start
- Period end

This prevents Mailchimp email metrics from overwriting other channels or other email metric rows.

## Required KPI_History Fields

The sync validates these fields before writing:

- `Unique Key`
- `Metric`
- `Metric Key`
- `KPI`
- `Value`
- `Unit`
- `Period Type`
- `Date`
- `Period Start`
- `Period End`
- `Aggregation Method`
- `Channel`
- `Platform`
- `Source Name`
- `Quality Status`
- `Snapshot Date`
- `Reporting Week`
- `Reporting Month`
- `Week Number`
- `Numerator`
- `Denominator`
- `Previous Value`
- `Change Percent`
- `Source Record ID`
- `Last Synced At`

If any field is missing, the endpoint returns `success: false` with `missingFields` and does not write partial records.

## Output

The sync response returns:

- Campaigns processed
- Date range processed
- Records created
- Records updated
- Records processed
- Missing fields
- Safe error messages
