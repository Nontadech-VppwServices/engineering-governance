# Central RPA Reporting

`POST /v1/rpa/events` validates and stores version 1 RPA run events idempotently. `POST /v1/workflow/events` accepts versioned Phase 4, Phase 5, and deployment events and creates a deduplicated notification outbox item. `GET /v1/reports?from=<ISO>&to=<ISO>` returns a period summary. Production failures create deduplicated alerts. The reporting worker creates daily, weekly and monthly reports in `Asia/Bangkok`, delivers through the Hermes LINE delivery adapter, retries with backoff and moves exhausted deliveries to `DEAD_LETTER`.
