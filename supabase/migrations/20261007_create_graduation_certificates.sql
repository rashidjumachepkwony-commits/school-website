-- ============================================================
-- Graduation certificates table
-- Stores metadata for generated PP1/PP2 graduation certificates.
-- Uses the same Supabase _id/data pattern as the rest of the app.
-- ============================================================

create table if not exists graduation_certificates (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

alter table graduation_certificates enable row level security;

-- Indexes for the fields the certificate route queries on.
create index if not exists idx_graduation_cert_student    on graduation_certificates ((data->>'studentId'));
create index if not exists idx_graduation_cert_number     on graduation_certificates ((data->>'certificateNumber'));
create index if not exists idx_graduation_cert_class      on graduation_certificates ((data->>'class'));
create index if not exists idx_graduation_cert_year       on graduation_certificates ((data->>'graduationYear'));
