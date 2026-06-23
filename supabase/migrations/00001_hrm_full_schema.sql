
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE public.user_role AS ENUM ('director', 'management', 'employee');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'half_day', 'on_leave');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'review', 'completed', 'cancelled');
CREATE TYPE public.project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE public.asset_status AS ENUM ('available', 'assigned', 'maintenance', 'retired');
CREATE TYPE public.candidate_status AS ENUM ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
CREATE TYPE public.payroll_status AS ENUM ('draft', 'processed', 'paid');
CREATE TYPE public.notification_type AS ENUM ('attendance', 'leave', 'payroll', 'announcement', 'task', 'project', 'training', 'recruitment', 'general');

-- Company settings (singleton)
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name text NOT NULL DEFAULT '',
  company_logo_url text,
  director_signup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default company settings row
INSERT INTO public.company_settings (id, company_name, director_signup_completed)
VALUES (uuid_generate_v4(), '', false);

-- Profiles (synced from auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  phone text UNIQUE,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  role user_role NOT NULL DEFAULT 'employee',
  department_id uuid,
  designation text,
  employee_id text UNIQUE,
  date_of_joining date,
  date_of_birth date,
  address text,
  emergency_contact text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Departments
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  head_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  parent_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK for profiles->departments
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;

-- Designations
CREATE TABLE public.designations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  level integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attendance
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in_time timestamptz,
  check_out_time timestamptz,
  working_hours numeric(5,2),
  status attendance_status NOT NULL DEFAULT 'absent',
  is_late boolean NOT NULL DEFAULT false,
  overtime_hours numeric(5,2) DEFAULT 0,
  notes text,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Leave types
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  max_days_per_year integer NOT NULL DEFAULT 0,
  carry_forward boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Leave balances
CREATE TABLE public.leave_balances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_days integer NOT NULL DEFAULT 0,
  used_days integer NOT NULL DEFAULT 0,
  remaining_days integer GENERATED ALWAYS AS (total_days - used_days) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);

-- Leave requests
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_days integer NOT NULL,
  reason text,
  status leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Salary structures
CREATE TABLE public.salary_structures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  basic_salary numeric(12,2) NOT NULL DEFAULT 0,
  hra numeric(12,2) NOT NULL DEFAULT 0,
  transport_allowance numeric(12,2) NOT NULL DEFAULT 0,
  other_allowances numeric(12,2) NOT NULL DEFAULT 0,
  tax_deduction numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payroll
CREATE TABLE public.payroll (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL,
  basic_salary numeric(12,2) NOT NULL DEFAULT 0,
  hra numeric(12,2) NOT NULL DEFAULT 0,
  transport_allowance numeric(12,2) NOT NULL DEFAULT 0,
  other_allowances numeric(12,2) NOT NULL DEFAULT 0,
  bonus numeric(12,2) NOT NULL DEFAULT 0,
  tax_deduction numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net_salary numeric(12,2) NOT NULL DEFAULT 0,
  working_days integer NOT NULL DEFAULT 0,
  present_days integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  status payroll_status NOT NULL DEFAULT 'draft',
  processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

-- Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  status project_status NOT NULL DEFAULT 'planning',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Project members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, employee_id)
);

-- Tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  priority task_priority NOT NULL DEFAULT 'medium',
  status task_status NOT NULL DEFAULT 'todo',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Recruitment jobs
CREATE TABLE public.job_openings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  description text,
  requirements text,
  location text,
  salary_range text,
  vacancies integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  posted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  closing_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Candidates
CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  resume_url text,
  status candidate_status NOT NULL DEFAULT 'applied',
  interview_date timestamptz,
  interviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  offer_letter_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Assets
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  asset_code text UNIQUE NOT NULL,
  category text NOT NULL,
  description text,
  purchase_date date,
  purchase_price numeric(12,2),
  status asset_status NOT NULL DEFAULT 'available',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  return_date timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Asset history
CREATE TABLE public.asset_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  action text NOT NULL,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performance reviews
CREATE TABLE public.performance_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  overall_rating numeric(3,1) CHECK (overall_rating BETWEEN 0 AND 5),
  technical_skills numeric(3,1),
  communication numeric(3,1),
  teamwork numeric(3,1),
  punctuality numeric(3,1),
  leadership numeric(3,1),
  comments text,
  goals_next_period text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- KPI goals
CREATE TABLE public.kpi_goals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_value numeric,
  current_value numeric DEFAULT 0,
  unit text,
  due_date date,
  is_completed boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Training programs
CREATE TABLE public.training_programs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  trainer text,
  start_date date,
  end_date date,
  duration_hours integer,
  mode text DEFAULT 'online',
  max_participants integer,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Training enrollments
CREATE TABLE public.training_enrollments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  training_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'enrolled',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  completed_at timestamptz,
  certificate_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(training_id, employee_id)
);

-- Announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  content text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  is_global boolean NOT NULL DEFAULT true,
  priority text NOT NULL DEFAULT 'normal',
  posted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_type text NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shift schedules
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shift assignments
CREATE TABLE public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  related_id uuid,
  related_table text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Activity logs
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  description text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Support tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority task_priority NOT NULL DEFAULT 'medium',
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS user_role LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.get_user_department(uid uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_director(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = uid AND role = 'director');
$$;

CREATE OR REPLACE FUNCTION public.is_management(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = uid AND role = 'management');
$$;

CREATE OR REPLACE FUNCTION public.is_management_or_director(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = uid AND role IN ('director','management'));
$$;

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'employee'::public.user_role)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- auto update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_leave_requests_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_payroll_updated BEFORE UPDATE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_company_settings_updated BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies

-- company_settings: anyone can read, only director can update
CREATE POLICY "Public read company_settings" ON public.company_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Director can update company_settings" ON public.company_settings FOR UPDATE TO authenticated USING (public.is_director(auth.uid()));

-- profiles
CREATE POLICY "Director full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management can view dept profiles" ON public.profiles FOR SELECT TO authenticated USING (
  public.is_management(auth.uid()) AND (department_id = public.get_user_department(auth.uid()) OR id = auth.uid())
);
CREATE POLICY "Employees view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (role IS NOT DISTINCT FROM public.get_user_role(auth.uid()));

-- departments: all authenticated can read, director manages
CREATE POLICY "All can read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Director manages departments" ON public.departments FOR ALL TO authenticated USING (public.is_director(auth.uid()));

-- designations: all can read, director manages
CREATE POLICY "All can read designations" ON public.designations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Director manages designations" ON public.designations FOR ALL TO authenticated USING (public.is_director(auth.uid()));

-- attendance
CREATE POLICY "Director full access attendance" ON public.attendance FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management view dept attendance" ON public.attendance FOR SELECT TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees manage own attendance" ON public.attendance FOR ALL TO authenticated USING (employee_id = auth.uid());

-- leave_types: all can read
CREATE POLICY "All read leave_types" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Director manages leave_types" ON public.leave_types FOR ALL TO authenticated USING (public.is_director(auth.uid()));

-- leave_balances
CREATE POLICY "Director full access leave_balances" ON public.leave_balances FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management view dept leave_balances" ON public.leave_balances FOR SELECT TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees view own leave_balances" ON public.leave_balances FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- leave_requests
CREATE POLICY "Director full access leave_requests" ON public.leave_requests FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage dept leave_requests" ON public.leave_requests FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees manage own leave_requests" ON public.leave_requests FOR ALL TO authenticated USING (employee_id = auth.uid());

-- salary_structures
CREATE POLICY "Director full access salary_structures" ON public.salary_structures FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Employees view own salary_structures" ON public.salary_structures FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- payroll
CREATE POLICY "Director full access payroll" ON public.payroll FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Employees view own payroll" ON public.payroll FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- projects
CREATE POLICY "Director full access projects" ON public.projects FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage projects" ON public.projects FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND (department_id = public.get_user_department(auth.uid()) OR manager_id = auth.uid() OR created_by = auth.uid())
);
CREATE POLICY "Employees view assigned projects" ON public.projects FOR SELECT TO authenticated USING (
  id IN (SELECT project_id FROM public.project_members WHERE employee_id = auth.uid())
);

-- project_members
CREATE POLICY "Director full access project_members" ON public.project_members FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage project_members" ON public.project_members FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees view own project_members" ON public.project_members FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- tasks
CREATE POLICY "Director full access tasks" ON public.tasks FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage dept tasks" ON public.tasks FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND (assigned_by = auth.uid() OR assigned_to IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid())))
);
CREATE POLICY "Employees manage own tasks" ON public.tasks FOR ALL TO authenticated USING (assigned_to = auth.uid() OR assigned_by = auth.uid());

-- job_openings
CREATE POLICY "All read job_openings" ON public.job_openings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Director manages job_openings" ON public.job_openings FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manages dept job_openings" ON public.job_openings FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND department_id = public.get_user_department(auth.uid())
);

-- candidates
CREATE POLICY "Director full access candidates" ON public.candidates FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage candidates" ON public.candidates FOR ALL TO authenticated USING (public.is_management(auth.uid()));

-- assets
CREATE POLICY "Director full access assets" ON public.assets FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management view assets" ON public.assets FOR SELECT TO authenticated USING (public.is_management(auth.uid()));
CREATE POLICY "Employees view own assets" ON public.assets FOR SELECT TO authenticated USING (assigned_to = auth.uid());

-- asset_history
CREATE POLICY "Director full access asset_history" ON public.asset_history FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management view asset_history" ON public.asset_history FOR SELECT TO authenticated USING (public.is_management(auth.uid()));

-- performance_reviews
CREATE POLICY "Director full access performance_reviews" ON public.performance_reviews FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage performance_reviews" ON public.performance_reviews FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND (reviewer_id = auth.uid() OR employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid())))
);
CREATE POLICY "Employees view own performance_reviews" ON public.performance_reviews FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- kpi_goals
CREATE POLICY "Director full access kpi_goals" ON public.kpi_goals FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage kpi_goals" ON public.kpi_goals FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND (created_by = auth.uid() OR employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid())))
);
CREATE POLICY "Employees view and update own kpi_goals" ON public.kpi_goals FOR ALL TO authenticated USING (employee_id = auth.uid());

-- training_programs
CREATE POLICY "All read training_programs" ON public.training_programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Director manages training_programs" ON public.training_programs FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manages dept training" ON public.training_programs FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND (department_id = public.get_user_department(auth.uid()) OR created_by = auth.uid())
);

-- training_enrollments
CREATE POLICY "Director full access training_enrollments" ON public.training_enrollments FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage training_enrollments" ON public.training_enrollments FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees view own training_enrollments" ON public.training_enrollments FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- announcements
CREATE POLICY "Director full access announcements" ON public.announcements FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage announcements" ON public.announcements FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND (is_global = true OR department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees read relevant announcements" ON public.announcements FOR SELECT TO authenticated USING (
  is_global = true OR department_id = public.get_user_department(auth.uid())
);

-- documents
CREATE POLICY "Director full access documents" ON public.documents FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management view dept documents" ON public.documents FOR SELECT TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees view own documents" ON public.documents FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- shifts
CREATE POLICY "All read shifts" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Director manages shifts" ON public.shifts FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manages dept shifts" ON public.shifts FOR ALL TO authenticated USING (public.is_management(auth.uid()));

-- shift_assignments
CREATE POLICY "Director full access shift_assignments" ON public.shift_assignments FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management manage shift_assignments" ON public.shift_assignments FOR ALL TO authenticated USING (
  public.is_management(auth.uid()) AND employee_id IN (SELECT id FROM public.profiles WHERE department_id = public.get_user_department(auth.uid()))
);
CREATE POLICY "Employees view own shift_assignments" ON public.shift_assignments FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- notifications
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Director full access notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_director(auth.uid()));

-- activity_logs
CREATE POLICY "Director full access activity_logs" ON public.activity_logs FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Users insert own activity_logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- support_tickets
CREATE POLICY "Director full access support_tickets" ON public.support_tickets FOR ALL TO authenticated USING (public.is_director(auth.uid()));
CREATE POLICY "Management view support_tickets" ON public.support_tickets FOR SELECT TO authenticated USING (public.is_management(auth.uid()));
CREATE POLICY "Employees manage own support_tickets" ON public.support_tickets FOR ALL TO authenticated USING (employee_id = auth.uid());

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll;

-- Seed default leave types
INSERT INTO public.leave_types (name, max_days_per_year, carry_forward) VALUES
  ('Annual Leave', 21, true),
  ('Sick Leave', 10, false),
  ('Casual Leave', 7, false),
  ('Maternity Leave', 90, false),
  ('Paternity Leave', 15, false),
  ('Emergency Leave', 3, false);
