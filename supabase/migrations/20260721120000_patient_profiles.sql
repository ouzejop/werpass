create table public.patient_profiles (
  patient_id uuid primary key references public.profiles(id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 24 and 65536),
  ciphertext_hash text not null check (ciphertext_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

alter table public.patient_profiles enable row level security;

create policy "patient_profile_all" on public.patient_profiles for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());
