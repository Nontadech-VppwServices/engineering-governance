-- Consolidated governance state. Replaces the four per-service schemas from
-- ai-sdlc-orchestrator, workflow-control, project-automation, hermes-governance
-- and rpa-reporting. Table names and constraints are preserved verbatim so an
-- existing database migrates in place.

CREATE TABLE IF NOT EXISTS ai_sdlc_jobs (
  job_id TEXT PRIMARY KEY,
  intake_event_id TEXT NOT NULL UNIQUE,
  jira_issue_key TEXT NOT NULL,
  state TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_sdlc_jobs_jira_issue_key ON ai_sdlc_jobs (jira_issue_key);
CREATE INDEX IF NOT EXISTS idx_ai_sdlc_jobs_state ON ai_sdlc_jobs (state);

CREATE TABLE IF NOT EXISTS workflow_actions (
  action_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_actions_status_idx ON workflow_actions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_automation_plans (
  plan_id text PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  state text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS project_automation_plans_state_idx ON project_automation_plans (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS hermes_learning_records (
  record_type text NOT NULL,
  record_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_type, record_id)
);
CREATE INDEX IF NOT EXISTS hermes_learning_scope_idx ON hermes_learning_records ((payload->>'scope')) WHERE record_type = 'memory';

CREATE TABLE IF NOT EXISTS hermes_learning_audit (
  event_id uuid PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS hermes_learning_audit_subject_idx ON hermes_learning_audit (subject_type, subject_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS rpa_run_events(
  event_id text PRIMARY KEY,
  run_id text NOT NULL,
  bot_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpa_run_events_period_idx ON rpa_run_events(occurred_at,bot_id,event_type);

CREATE TABLE IF NOT EXISTS workflow_events(
  event_id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_events_period_idx ON workflow_events(occurred_at,aggregate_type,event_type);

CREATE TABLE IF NOT EXISTS notification_outbox(
  id text PRIMARY KEY,
  target_id text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox(status,next_attempt_at);

-- Every MCP tool call is auditable per policies/ai-sdlc-mcp.md.
CREATE TABLE IF NOT EXISTS mcp_tool_audit(
  event_id uuid PRIMARY KEY,
  job_id text,
  tool_name text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL,
  evidence_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_tool_audit_job_idx ON mcp_tool_audit(job_id, occurred_at DESC);
