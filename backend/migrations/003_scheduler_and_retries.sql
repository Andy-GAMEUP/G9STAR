ALTER TABLE outbox_events ADD COLUMN next_attempt_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN last_error text;
CREATE INDEX outbox_events_retry_idx ON outbox_events(next_attempt_at,created_at) WHERE published_at IS NULL;
CREATE TABLE business_holidays (holiday_date date PRIMARY KEY, name text NOT NULL, country_code char(2) NOT NULL DEFAULT 'KR');
CREATE TABLE scheduler_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_name text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL CHECK(status IN ('RUNNING','SUCCESS','FAILED')), detail jsonb NOT NULL DEFAULT '{}'::jsonb);
