CREATE TABLE IF NOT EXISTS project_automation_plans (
  plan_id text PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  state text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS project_automation_plans_state_idx ON project_automation_plans (state, updated_at DESC);
