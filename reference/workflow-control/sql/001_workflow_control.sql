CREATE TABLE IF NOT EXISTS workflow_actions (
  action_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_actions_status_idx ON workflow_actions(status, updated_at DESC);
