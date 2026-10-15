-- ============================================================
-- Computer Studies Holiday Tuition Registration System
-- Migration: Additive tables only — no existing tables are altered.
--
-- Tables created:
--   computer_tuition_programmes   – editable programme settings
--   computer_tuition_registrations – parent/guardian registration forms
--   computer_tuition_payments     - payment ledger (one row per receipt)
--   computer_tuition_sms_logs     – SMS notification audit trail
--
-- Apply via Supabase SQL Editor:
--   1. Open https://supabase.com/dashboard/project/gspikjhqvklixzdnlwhn
--   2. SQL Editor → New query → paste this file → Run
-- ============================================================

-- ----------------------------------------------------------------
-- Programme settings (single row, section_key = 'computer_tuition')
-- ----------------------------------------------------------------
create table if not exists computer_tuition_programmes (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);
create index if not exists idx_ct_programme_key on computer_tuition_programmes ((data->>'section_key'));
alter table computer_tuition_programmes enable row level security;

-- ----------------------------------------------------------------
-- Registrations
-- ----------------------------------------------------------------
create table if not exists computer_tuition_registrations (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);
create index if not exists idx_ct_reg_regno   on computer_tuition_registrations ((data->>'registration_number'));
create index if not exists idx_ct_reg_status  on computer_tuition_registrations ((data->>'application_status'));
create index if not exists idx_ct_reg_phone   on computer_tuition_registrations ((data->>'guardian_phone'));
create index if not exists idx_ct_reg_student on computer_tuition_registrations ((data->>'student_name'));
create index if not exists idx_ct_reg_grade   on computer_tuition_registrations ((data->>'grade_class'));
create index if not exists idx_ct_reg_created on computer_tuition_registrations ((data->>'created_at'));
create index if not exists idx_ct_reg_payment on computer_tuition_registrations ((data->>'payment_status'));
alter table computer_tuition_registrations enable row level security;

-- ----------------------------------------------------------------
-- Payment ledger
-- ----------------------------------------------------------------
create table if not exists computer_tuition_payments (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);
create index if not exists idx_ct_pay_regid   on computer_tuition_payments ((data->>'registration_id'));
create index if not exists idx_ct_pay_date    on computer_tuition_payments ((data->>'payment_date'));
create index if not exists idx_ct_pay_method  on computer_tuition_payments ((data->>'payment_method'));
alter table computer_tuition_payments enable row level security;

-- ----------------------------------------------------------------
-- SMS notification audit trail
-- ----------------------------------------------------------------
create table if not exists computer_tuition_sms_logs (
  _id   text primary key,
  data  jsonb not null default '{}'::jsonb
);
create index if not exists idx_ct_sms_regid   on computer_tuition_sms_logs ((data->>'registration_id'));
create index if not exists idx_ct_sms_status  on computer_tuition_sms_logs ((data->>'status'));
create index if not exists idx_ct_sms_phone   on computer_tuition_sms_logs ((data->>'phone_number'));
create index if not exists idx_ct_sms_created on computer_tuition_sms_logs ((data->>'created_at'));
alter table computer_tuition_sms_logs enable row level security;

-- ----------------------------------------------------------------
-- Unique constraint on registration numbers (via expression index)
-- ----------------------------------------------------------------
create unique index if not exists uk_ct_registration_number
  on computer_tuition_registrations ((data->>'registration_number'));
