-- The portal creates an ephemeral Curve25519 public key for each request.
-- Supabase stores public/encrypted material only; neither the patient master key
-- nor a clear document key is persisted remotely.
alter table public.share_sessions
  add column if not exists portal_public_key text,
  add column if not exists patient_ephemeral_public_key text,
  add column if not exists encrypted_file_key_for_portal text,
  add column if not exists portal_key_nonce text;
