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
