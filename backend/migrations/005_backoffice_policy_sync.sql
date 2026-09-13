ALTER TABLE coupon_campaigns
  ADD COLUMN discount_type text NOT NULL DEFAULT 'FIXED' CHECK(discount_type IN ('FIXED','PERCENT')),
  ADD COLUMN discount_value bigint NOT NULL DEFAULT 0 CHECK(discount_value>=0),
  ADD COLUMN scope jsonb NOT NULL DEFAULT '{"type":"ALL"}'::jsonb,
  ADD COLUMN usage_limit_per_member integer NOT NULL DEFAULT 1 CHECK(usage_limit_per_member>0);

CREATE INDEX coupon_campaigns_active_code_idx
  ON coupon_campaigns(code,starts_at,ends_at)
  WHERE status='ACTIVE';
