-- Hackathon MVP: an 8-character Base64 URL token is easier to copy manually
-- than a UUID while retaining 48 bits of randomness from crypto.randomUUID().
-- Existing UUID tokens stay valid during the transition.
alter table public.share_sessions
  alter column opaque_token drop default;

alter table public.share_sessions
  alter column opaque_token type text using opaque_token::text;

alter table public.share_sessions
  add constraint share_sessions_opaque_token_format
  check (opaque_token ~ '^[A-Za-z0-9_-]{8}$' or opaque_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
