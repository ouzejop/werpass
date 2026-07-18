create extension if not exists pgcrypto;

create type public.profile_role as enum ('patient', 'clinician');
create type public.share_state as enum ('pending', 'approved', 'revoked', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.profile_role not null default 'patient',
  demo_label text not null check (char_length(demo_label) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, patient_id)
);

create table public.document_versions (
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null check (version > 0),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 24 and 10000000),
  ciphertext_hash text not null check (ciphertext_hash ~ '^[a-f0-9]{64}$'),
  wrapped_file_key text not null check (char_length(wrapped_file_key) between 24 and 4096),
  encrypted_metadata text not null check (char_length(encrypted_metadata) between 24 and 65536),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 5000000),
  created_at timestamptz not null,
  primary key (document_id, version),
  foreign key (document_id, patient_id) references public.documents(id, patient_id)
);

create table public.sync_mutations (
  id uuid primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null,
  version integer not null,
  created_at timestamptz not null default now(),
  unique (patient_id, document_id, version),
  foreign key (document_id, version) references public.document_versions(document_id, version)
);

create table public.share_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  opaque_token uuid not null unique default gen_random_uuid(),
  state public.share_state not null default 'pending',
  expires_at timestamptz not null check (expires_at > created_at),
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.share_items (
  session_id uuid not null references public.share_sessions(id) on delete cascade,
  document_id uuid not null,
  version integer not null,
  primary key (session_id, document_id, version),
  foreign key (document_id, version) references public.document_versions(document_id, version)
);

create table public.medical_access_codes (
  session_id uuid primary key references public.share_sessions(id) on delete cascade,
  code_digest text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  expires_at timestamptz not null
);

create table public.access_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.share_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('approved', 'code_failed', 'accessed', 'revoked', 'expired')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.share_sessions enable row level security;
alter table public.share_items enable row level security;
alter table public.medical_access_codes enable row level security;
alter table public.access_events enable row level security;

create policy "profile_self_read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "patient_documents_all" on public.documents for all to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "patient_versions_all" on public.document_versions for all to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "patient_mutations_read" on public.sync_mutations for select to authenticated using (patient_id = auth.uid());
create policy "patient_mutations_insert" on public.sync_mutations for insert to authenticated with check (patient_id = auth.uid());
create policy "patient_sessions_all" on public.share_sessions for all to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "patient_share_items_read" on public.share_items for select to authenticated using (
  exists (select 1 from public.share_sessions s where s.id = session_id and s.patient_id = auth.uid())
);
create policy "patient_share_items_insert" on public.share_items for insert to authenticated with check (
  exists (select 1 from public.share_sessions s where s.id = session_id and s.patient_id = auth.uid() and s.state = 'pending')
  and exists (select 1 from public.documents d where d.id = document_id and d.patient_id = auth.uid())
);
create policy "patient_access_events_read" on public.access_events for select to authenticated using (
  exists (select 1 from public.share_sessions s where s.id = session_id and s.patient_id = auth.uid())
);

revoke all on public.medical_access_codes from anon, authenticated;
revoke insert, update, delete on public.access_events from anon, authenticated;

create function public.prevent_version_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'document versions are immutable';
end;
$$;
create trigger document_versions_immutable before update or delete on public.document_versions
for each row execute function public.prevent_version_mutation();

create function public.create_demo_profile(label text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.profiles(id, role, demo_label) values (auth.uid(), 'patient', label)
  on conflict (id) do update set demo_label = excluded.demo_label
  returning * into result;
  return result;
end;
$$;
revoke all on function public.create_demo_profile(text) from public;
grant execute on function public.create_demo_profile(text) to authenticated;
