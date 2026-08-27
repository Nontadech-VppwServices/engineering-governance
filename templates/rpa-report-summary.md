# RPA Scheduled Report Template

This template defines the logical report content. The LINE Messaging adapter may render it as text or a richer supported message format without changing the underlying metrics.

## Header

```text
RPA {{REPORT_TYPE}} REPORT
Period: {{PERIOD_START}} - {{PERIOD_END}}
Timezone: Asia/Bangkok
```

`REPORT_TYPE` is one of `DAILY`, `WEEKLY`, or `MONTHLY`.

## Organization summary

```text
Executions: {{TOTAL_RUNS}}
Success: {{SUCCESS_RUNS}}
Failed: {{FAILED_RUNS}}
Skipped/Cancelled: {{SKIPPED_CANCELLED_RUNS}}
Success rate: {{SUCCESS_RATE}}%

Items processed: {{ITEMS_PROCESSED}}
Items succeeded: {{ITEMS_SUCCEEDED}}
Items failed: {{ITEMS_FAILED}}
Retries: {{RETRY_COUNT}}
Average duration: {{AVERAGE_DURATION}}
```

## Per-bot summary

```text
{{BOT_ID}}
- Runs: {{RUNS}}
- Success/Failed: {{SUCCESS}} / {{FAILED}}
- Success rate: {{SUCCESS_RATE}}%
- Items processed: {{ITEMS_PROCESSED}}
- Average duration: {{AVERAGE_DURATION}}
```

Repeat for each governed bot.

## Failure summary

```text
Top failures:
1. {{ERROR_CODE_1}} - {{COUNT_1}}
2. {{ERROR_CODE_2}} - {{COUNT_2}}
3. {{ERROR_CODE_3}} - {{COUNT_3}}
```

Do not include credentials, raw stack traces, sensitive payloads, unrestricted customer/order/invoice details, cookies, or tokens.

## Evidence

```text
Details: {{DASHBOARD_OR_EVIDENCE_REFERENCE}}
Report ID: {{REPORT_ID}}
```

## Immediate critical alert (optional)

```text
RPA ALERT
Bot: {{BOT_ID}}
Environment: {{ENVIRONMENT}}
Status: FAILED
Error: {{ERROR_CODE}}
Summary: {{SANITIZED_ERROR_SUMMARY}}
Run: {{RUN_ID}}
Evidence: {{EVIDENCE_REFERENCE}}
```

Alerts must be deduplicated/throttled according to `policies/rpa-reporting.md`.
