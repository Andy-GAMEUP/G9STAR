CREATE TABLE backoffice_entities (
  module text NOT NULL CHECK(module IN ('partners','referrals','coupons','products','inventory','showcases','orders','claims','estimates','rentals','members','contents','notifications','settlements','admins','integrations')),
  entity_id text NOT NULL,
  status text NOT NULL,
  partner_key text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(module,entity_id)
);
CREATE INDEX backoffice_entities_list_idx ON backoffice_entities(module,status,partner_key,updated_at DESC);
CREATE INDEX backoffice_entities_search_idx ON backoffice_entities USING gin(payload);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL, kind text NOT NULL CHECK(kind IN ('RECEIPT','ADJUSTMENT','RESERVATION','RELEASE','SHIPMENT','RETURN')),
  quantity integer NOT NULL CHECK(quantity<>0), before_quantity integer NOT NULL CHECK(before_quantity>=0), after_quantity integer NOT NULL CHECK(after_quantity>=0),
  reason text NOT NULL, actor_id text NOT NULL, idempotency_key text UNIQUE, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE estimate_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estimate_key text NOT NULL, version integer NOT NULL CHECK(version>0), items jsonb NOT NULL,
  shipping_krw bigint NOT NULL DEFAULT 0 CHECK(shipping_krw>=0), installation_krw bigint NOT NULL DEFAULT 0 CHECK(installation_krw>=0), construction_krw bigint NOT NULL DEFAULT 0 CHECK(construction_krw>=0),
  total_krw bigint NOT NULL CHECK(total_krw>=0), created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(estimate_key,version)
);
CREATE TABLE partner_api_keys (
  partner_key text PRIMARY KEY, secret_hash text NOT NULL, masked_key text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_key text NOT NULL, recipient_key text NOT NULL, channel text NOT NULL,
  template_key text NOT NULL, payload jsonb NOT NULL, status text NOT NULL CHECK(status IN ('QUEUED','SENT','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0, last_error text, idempotency_key text UNIQUE NOT NULL, scheduled_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX notification_deliveries_queue_idx ON notification_deliveries(status,scheduled_at) WHERE status IN ('QUEUED','FAILED');
CREATE TABLE integration_reprocess_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), integration_key text NOT NULL, source_payload jsonb NOT NULL, status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCESS','FAILED')),
  attempts integer NOT NULL DEFAULT 0, requested_by text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, last_error text
);
