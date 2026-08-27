CREATE TABLE IF NOT EXISTS rpa_run_events(event_id text PRIMARY KEY,run_id text NOT NULL,bot_id text NOT NULL,project_id text NOT NULL,environment text NOT NULL,event_type text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rpa_run_events_period_idx ON rpa_run_events(occurred_at,bot_id,event_type);
CREATE TABLE IF NOT EXISTS workflow_events(event_id text PRIMARY KEY,aggregate_type text NOT NULL,aggregate_id text NOT NULL,event_type text NOT NULL,occurred_at timestamptz NOT NULL,payload jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS workflow_events_period_idx ON workflow_events(occurred_at,aggregate_type,event_type);
CREATE TABLE IF NOT EXISTS notification_outbox(id text PRIMARY KEY,target_id text NOT NULL,message text NOT NULL,status text NOT NULL DEFAULT 'PENDING',attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox(status,next_attempt_at);
