-- Neon SQL Editor: replace only MASTER_EMAIL_HERE and NEW_PASSWORD_HERE.
-- Do not commit a copy containing your real password.
-- Resets the existing master only; preserves members and other administrators.
DO $reset_master$
DECLARE
  target_email text := lower(trim('MASTER_EMAIL_HERE'));
  new_password text := $password$NEW_PASSWORD_HERE$password$;
  salt text := replace(gen_random_uuid()::text, '-', '');
  key_bytes bytea;
  ipad bytea := decode(repeat('00', 64), 'hex');
  opad bytea := decode(repeat('00', 64), 'hex');
  u bytea;
  result_bits bit(256);
  result_hex text := '';
  stored jsonb;
  account jsonb;
  account_index integer;
  match_count integer;
  i integer;
BEGIN
  IF target_email = 'master_email_here' OR position('@' IN target_email) = 0 THEN
    RAISE EXCEPTION 'Replace MASTER_EMAIL_HERE with your existing master email.';
  END IF;
  IF new_password = 'NEW_PASSWORD_HERE' OR length(new_password) < 8
    OR length(new_password) > 200 OR new_password !~ '[A-Za-z]'
    OR new_password !~ '[0-9]' OR NOT EXISTS (
      SELECT 1 FROM generate_series(1, length(new_password)) AS chars(pos)
      WHERE ascii(substr(new_password, pos, 1)) BETWEEN 33 AND 47
         OR ascii(substr(new_password, pos, 1)) BETWEEN 58 AND 64
         OR ascii(substr(new_password, pos, 1)) BETWEEN 91 AND 96
         OR ascii(substr(new_password, pos, 1)) BETWEEN 123 AND 126
    ) THEN
    RAISE EXCEPTION 'Use 8-200 characters including English letters, digits and a special character.';
  END IF;

  -- PBKDF2-HMAC-SHA256, 100000 iterations, 32 bytes.
  -- The application uses the UTF-8 bytes of the hexadecimal salt text.
  key_bytes := convert_to(new_password, 'UTF8');
  IF length(key_bytes) > 64 THEN key_bytes := sha256(key_bytes); END IF;
  key_bytes := key_bytes || decode(repeat('00', 64 - length(key_bytes)), 'hex');
  FOR i IN 0..63 LOOP
    ipad := set_byte(ipad, i, get_byte(key_bytes, i) # 54);
    opad := set_byte(opad, i, get_byte(key_bytes, i) # 92);
  END LOOP;
  u := sha256(opad || sha256(ipad || convert_to(salt, 'UTF8') || decode('00000001', 'hex')));
  result_bits := ('x' || encode(u, 'hex'))::bit(256);
  FOR i IN 2..100000 LOOP
    u := sha256(opad || sha256(ipad || u));
    result_bits := result_bits # ('x' || encode(u, 'hex'))::bit(256);
  END LOOP;
  FOR i IN 0..3 LOOP
    result_hex := result_hex || lpad(to_hex(substring(result_bits FROM i * 64 + 1 FOR 64)::bit(64)::bigint), 16, '0');
  END LOOP;

  SELECT payload INTO stored FROM beta_state WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'beta_state id=1 does not exist; no changes made.'; END IF;
  SELECT count(*), min((ordinal - 1)::integer) INTO match_count, account_index
  FROM jsonb_array_elements(coalesce(stored->'adminAccounts', '[]'::jsonb)) WITH ORDINALITY AS admins(value, ordinal)
  WHERE lower(value->>'email') = target_email AND value->>'role' = 'SUPER_ADMIN';
  IF match_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one existing SUPER_ADMIN for this email; no changes made.';
  END IF;
  account := (stored->'adminAccounts'->account_index) - 'recovery' - 'expiresAt' - 'temporaryPasswordExpiresAt';
  account := account || jsonb_build_object(
    'passwordHash', salt || ':' || result_hex,
    'sessionId', NULL, 'mustChangePassword', false,
    'role', 'SUPER_ADMIN', 'status', 'ACTIVE', 'updatedAt', now()
  );
  UPDATE beta_state SET
    payload = jsonb_set(stored, ARRAY['adminAccounts', account_index::text], account),
    version = version + 1, updated_at = now()
  WHERE id = 1;
  RAISE NOTICE 'Master password reset completed. Log in again with your new password.';
END
$reset_master$;

-- Confirmation shows no password or password hash.
SELECT value->>'email' AS email, value->>'role' AS role,
       value->>'status' AS status
FROM beta_state, jsonb_array_elements(payload->'adminAccounts') AS admins(value)
WHERE id = 1 AND value->>'role' = 'SUPER_ADMIN';
