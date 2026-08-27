CREATE TABLE IF NOT EXISTS ai_sdlc_jobs (
  job_id TEXT PRIMARY KEY,
  intake_event_id TEXT NOT NULL UNIQUE,
  jira_issue_key TEXT NOT NULL,
  state TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_sdlc_jobs_jira_issue_key
  ON ai_sdlc_jobs (jira_issue_key);

CREATE INDEX IF NOT EXISTS idx_ai_sdlc_jobs_state
  ON ai_sdlc_jobs (state);
