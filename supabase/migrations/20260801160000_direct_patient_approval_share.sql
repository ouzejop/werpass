-- Hackathon MVP: the patient approves the professional's browser request directly.
-- The short QR token starts a request only; the high-entropy portal_request_id
-- stays in that browser and is never shown in the QR or app UI.
alter type public.share_state add value if not exists 'accessed';

alter table public.share_sessions
  add column if not exists portal_request_id uuid;

create unique index if not exists share_sessions_portal_request_id_unique
  on public.share_sessions (portal_request_id)
  where portal_request_id is not null;
