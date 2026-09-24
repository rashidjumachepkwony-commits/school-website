-- Changara Star Academy - compatibility columns for the Supabase Worker migration
-- Safe to run after the main schema migration.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS parent_id text,
  ADD COLUMN IF NOT EXISTS stream text,
  ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS term text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'cat1',
  ADD COLUMN IF NOT EXISTS max_marks numeric(10,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS academic_year text,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.assessment_results
  ADD COLUMN IF NOT EXISTS assessment_id text,
  ADD COLUMN IF NOT EXISTS student_id text,
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS teacher_id text;

ALTER TABLE public.syllabus
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS file_url text;

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS time_spent text,
  ADD COLUMN IF NOT EXISTS file_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.holiday_assignments
  ADD COLUMN IF NOT EXISTS file_public_id text,
  ADD COLUMN IF NOT EXISTS file_resource_type text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS uploaded_by text;

-- A lightweight grade compatibility source used by the existing API.
CREATE TABLE IF NOT EXISTS public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.grades (name, sort_order)
VALUES
  ('PP1',1),('PP2',2),('Grade 1',3),('Grade 2',4),('Grade 3',5),
  ('Grade 4',6),('Grade 5',7),('Grade 6',8),('Grade 7',9),('Grade 8',10),('Grade 9',11)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- Keep the existing RLS model: browser clients do not get direct table access.
