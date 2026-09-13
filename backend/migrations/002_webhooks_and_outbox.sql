CREATE TABLE webhook_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text UNIQUE NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outbox_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic text NOT NULL, aggregate_id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, attempts integer NOT NULL DEFAULT 0);
CREATE INDEX outbox_events_pending_idx ON outbox_events(created_at) WHERE published_at IS NULL;
