alter table public.document_versions
  drop constraint if exists document_versions_mime_type_check;

alter table public.document_versions
  add constraint document_versions_mime_type_check
  check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'));
