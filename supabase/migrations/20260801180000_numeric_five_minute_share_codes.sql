-- Hackathon MVP: the patient explicitly creates an easy-to-type numeric code.
-- Legacy 8-character Base64 URL and UUID codes remain readable until expiry.
alter table public.share_sessions
  drop constraint if exists share_sessions_opaque_token_format;

alter table public.share_sessions
  add constraint share_sessions_opaque_token_format
  check (
    opaque_token ~ '^[0-9]{8}$'
    or opaque_token ~ '^[A-Za-z0-9_-]{8}$'
    or opaque_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );
