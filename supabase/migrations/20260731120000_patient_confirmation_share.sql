alter type public.share_state add value if not exists 'requested';
alter type public.share_state add value if not exists 'declined';

alter table public.share_sessions
  add column if not exists requester_name text,
  add column if not exists requester_facility text,
  add column if not exists requested_at timestamptz,
  add column if not exists declined_at timestamptz;

alter table public.share_sessions
  add constraint share_requester_name_check
  check (requester_name is null or char_length(requester_name) between 2 and 80),
  add constraint share_requester_facility_check
  check (requester_facility is null or char_length(requester_facility) between 2 and 120);

alter table public.access_events
  drop constraint if exists access_events_event_type_check;

alter table public.access_events
  add constraint access_events_event_type_check
  check (event_type in ('requested', 'approved', 'declined', 'code_failed', 'accessed', 'revoked', 'expired'));
