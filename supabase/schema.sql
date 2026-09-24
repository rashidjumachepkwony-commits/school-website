-- ============================================================
-- Changara Star Academy — Supabase schema
-- Compatibility tables used by the Supabase-backed Worker route layer.
--
-- Storage model: each collection is a table with
--   _id  text PRIMARY KEY   (24-hex id, same format as old ObjectIds)
--   data jsonb              (the full document — nothing is lost)
--
-- HOW TO APPLY:
--   Supabase Dashboard (https://supabase.com/dashboard/project/gspikjhqvklixzdnlwhn)
--   → SQL Editor → New query → paste this file → Run.
--
-- SECURITY:
--   RLS is enabled on every table with NO public policies.
--   The backend Worker uses the service_role key (bypasses RLS).
--   anon/authenticated users can read/write nothing. Never expose the
--   service-role key in frontend code.
-- ============================================================

create table if not exists admins (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists contents (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

-- Legacy fallback collection also queried by the content routes.
create table if not exists content (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists teachers (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists students (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists attendances (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists visitors (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists assessments (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists "assessmentResults" (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists classes (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists grades (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists subjects (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists syllabus (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

create table if not exists holidayassignments (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------- RLS lockdown
alter table admins            enable row level security;
alter table contents          enable row level security;
alter table content           enable row level security;
alter table teachers          enable row level security;
alter table students          enable row level security;
alter table attendances       enable row level security;
alter table visitors          enable row level security;
alter table assessments       enable row level security;
alter table "assessmentResults" enable row level security;
alter table classes           enable row level security;
alter table grades            enable row level security;
alter table subjects          enable row level security;
alter table syllabus          enable row level security;
alter table holidayassignments enable row level security;

-- No public policies are created on purpose: the backend Worker connects with
-- the service_role key (BYPASSRLS), so only it can access school data.

-- ---------------------------------------------------------- indexes
-- Expression indexes on the fields the Worker filters/sorts on.

create index if not exists idx_admins_username        on admins        ((data->>'username'));
create index if not exists idx_admins_email           on admins        ((data->>'email'));

create index if not exists idx_contents_section_key   on contents      ((data->>'section_key'));
create index if not exists idx_content_section_key    on content       ((data->>'section_key'));

create index if not exists idx_teachers_employeeid    on teachers      ((data->>'employeeId'));
create index if not exists idx_teachers_email         on teachers      ((data->>'email'));
create index if not exists idx_teachers_createdat     on teachers      ((data->>'createdAt'));

create index if not exists idx_students_admission     on students      ((data->>'admissionNumber'));
create index if not exists idx_students_class         on students      ((data->>'class'));
create index if not exists idx_students_createdat     on students      ((data->>'createdAt'));

create index if not exists idx_attendance_date        on attendances   ((data->>'date'));
create index if not exists idx_attendance_employeeid  on attendances   ((data->>'employeeId'));
create index if not exists idx_attendance_studentid   on attendances   ((data->>'studentId'));
create index if not exists idx_attendance_class       on attendances   ((data->>'class'));
create index if not exists idx_attendance_type        on attendances   ((data->>'type'));
create index if not exists idx_attendance_createdat   on attendances   ((data->>'createdAt'));

create index if not exists idx_visitors_createdat     on visitors      ((data->>'createdAt'));
create index if not exists idx_visitors_date          on visitors      ((data->>'date'));

create index if not exists idx_assessments_class      on assessments   ((data->>'class'));
create index if not exists idx_assessments_subject    on assessments   ((data->>'subject'));
create index if not exists idx_assessments_term       on assessments   ((data->>'term'));

create index if not exists idx_results_assessmentid   on "assessmentResults" ((data->>'assessmentId'));
create index if not exists idx_results_studentid      on "assessmentResults" ((data->>'studentId'));
create index if not exists idx_results_class          on "assessmentResults" ((data->>'class'));
create index if not exists idx_results_term           on "assessmentResults" ((data->>'term'));
create index if not exists idx_results_student_class  on "assessmentResults" ((data->'student'->>'class'));
create index if not exists idx_results_createdat      on "assessmentResults" ((data->>'createdAt'));

create index if not exists idx_classes_name           on classes       ((data->>'name'));
create index if not exists idx_grades_name            on grades        ((data->>'name'));
create index if not exists idx_subjects_class         on subjects      ((data->>'class'));
create index if not exists idx_subjects_name          on subjects      ((data->>'name'));
create index if not exists idx_syllabus_createdat     on syllabus      ((data->>'createdAt'));

create index if not exists idx_holiday_grade          on holidayassignments ((data->>'grade'));
create index if not exists idx_holiday_isactive       on holidayassignments ((data->>'isActive'));
create index if not exists idx_holiday_createdat      on holidayassignments ((data->>'createdAt'));

-- Generic JSONB index (speeds up ad-hoc jsonb filters).
create index if not exists idx_attendances_data_gin   on attendances   using gin (data);
create index if not exists idx_students_data_gin      on students      using gin (data);
-- ============================================================
-- Additive application configuration + clerk/fees support
-- These tables are independent of the legacy document tables and
-- therefore do not alter existing records.
-- ============================================================
create table if not exists system_settings (
  _id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists fee_structures (
  _id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists fee_payments (
  _id text primary key,
  data jsonb not null default '{}'::jsonb
);

alter table system_settings enable row level security;
alter table fee_structures enable row level security;
alter table fee_payments enable row level security;

create index if not exists idx_settings_key on system_settings ((data->>'key'));
create index if not exists idx_fee_structures_type on fee_structures ((data->>'type'));
create index if not exists idx_fee_payments_student on fee_payments ((data->>'studentId'));
create index if not exists idx_fee_payments_date on fee_payments ((data->>'paymentDate'));
