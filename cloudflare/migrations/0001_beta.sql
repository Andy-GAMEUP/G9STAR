-- Run once in Neon SQL Editor before deploying the Worker.
CREATE TABLE IF NOT EXISTS beta_state (
 id integer PRIMARY KEY CHECK(id=1),
 version bigint NOT NULL,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beta_rate_limits (
 key text PRIMARY KEY,
 count integer NOT NULL,
 expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS beta_rate_limits_expiry ON beta_rate_limits(expires_at);
