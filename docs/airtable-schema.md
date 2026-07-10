# Stage 2 Airtable Schema

The backend verifies four tables:

- `KPI Sources`
- `KPIs`
- `KPI Records`
- `Import Jobs`

## KPI Sources

| Field | Suggested type | Used for |
| --- | --- | --- |
| `Name` | Single line text | Display/read route |
| `Source Key` | Single line text | Finding the linked source |

Required placeholder record:

| Name | Source Key |
| --- | --- |
| Example Source | `example-source` |

## KPIs

| Field | Suggested type | Used for |
| --- | --- | --- |
| `Name` | Single line text | Display/read route |
| `KPI Key` | Single line text | Finding the linked KPI |

Required placeholder records:

| Name | KPI Key |
| --- | --- |
| Monthly Revenue | `monthly-revenue` |
| New Leads | `new-leads` |
| Conversion Rate | `conversion-rate` |

## KPI Records

These are the only KPI Record fields written by the backend:

| Field | Suggested type |
| --- | --- |
| `Unique Key` | Single line text |
| `KPI` | Link to `KPIs` |
| `KPI Source` | Link to `KPI Sources` |
| `Import Job` | Link to `Import Jobs` |
| `Reporting Date` | Date |
| `Period Type` | Single select or single line text |
| `Value` | Number |
| `Unit` | Single line text or single select |
| `Raw JSON` | Long text |

Do not make these formula-only fields if you want the backend to write them.

## Import Jobs

These are the Import Job fields written by the backend:

| Field | Suggested type |
| --- | --- |
| `Name` | Single line text |
| `Job ID` | Single line text |
| `Status` | Single select or single line text |
| `Started At` | Date/time |
| `Finished At` | Date/time |
| `Records Created` | Number |
| `Records Updated` | Number |
| `Records Failed` | Number |
| `Error Message` | Long text |
