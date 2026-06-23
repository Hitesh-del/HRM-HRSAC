export type UserRole = 'director' | 'management' | 'employee' | 'intern';
export type LeaveStatus = 'pending' | 'under_manager_review' | 'manager_approved' | 'director_review' | 'approved' | 'rejected' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'overtime' | 'holiday' | 'weekend_off' | 'on_leave';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed' | 'cancelled';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'retired';
export type CandidateStatus = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
export type PayrollStatus = 'draft' | 'processed' | 'generated' | 'pending' | 'paid';
export type NotificationType = 'attendance' | 'leave' | 'payroll' | 'announcement' | 'task' | 'project' | 'training' | 'recruitment' | 'general';
export type MeetingType = 'department' | 'team' | 'one_on_one' | 'all_hands';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'ended' | 'cancelled';
export type MeetingParticipantRole = 'moderator' | 'participant';

export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  room_id: string;
  organizer_id: string;
  department_id: string | null;
  meeting_type: MeetingType;
  status: MeetingStatus;
  start_time: string;
  end_time: string;
  agenda: string | null;
  created_at: string;
  updated_at: string;
  organizer?: Profile;
  department?: Department;
  participants?: MeetingParticipant[];
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  profile_id: string;
  role: MeetingParticipantRole;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  attendance_status: 'pending' | 'joined' | 'attended' | 'absent';
  created_at: string;
  profile?: Profile;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  company_logo_url: string | null;
  director_signup_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyWorkSchedule {
  id: string;
  company_settings_id: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  start_time: string;
  end_time: string;
  late_threshold_few: number;
  late_threshold_late: number;
  early_threshold_few: number;
  early_threshold_early: number;
  half_day_threshold_pct: number;
  updated_at: string;
}

export interface Holiday {
  id: string;
  company_settings_id: string;
  name: string;
  date: string;
  reason: string | null;
  type: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  department_id: string | null;
  designation: string | null;
  employee_id: string | null;
  date_of_joining: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  head_id: string | null;
  parent_department_id: string | null;
  created_at: string;
  updated_at: string;
  head?: Profile;
}

export interface Designation {
  id: string;
  title: string;
  department_id: string | null;
  level: number;
  created_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  working_hours: number | null;
  status: AttendanceStatus;
  is_late: boolean;
  overtime_hours: number;
  late_minutes: number;
  early_minutes: number;
  late_label: string | null;
  early_label: string | null;
  checkout_label: string | null;
  notes: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Profile;
}

export interface LeaveType {
  id: string;
  name: string;
  max_days_per_year: number;
  carry_forward: boolean;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
  created_at: string;
  updated_at: string;
  leave_type?: LeaveType;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  manager_id: string | null;
  manager_comment: string | null;
  manager_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: Profile;
  leave_type?: LeaveType;
  reviewer?: Profile;
}

export interface SalaryStructure {
  id: string;
  employee_id: string;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  medical_allowance: number;
  special_allowance: number;
  other_allowances: number;
  pf_deduction: number;
  esi_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  effective_from: string;
  created_at: string;
  updated_at: string;
  employee?: Profile;
}

export interface Payroll {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  basic_salary: number;
  hra: number;
  transport_allowance: number;
  medical_allowance: number;
  special_allowance: number;
  other_allowances: number;
  bonus: number;
  overtime_pay: number;
  pf_deduction: number;
  esi_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  unpaid_leave_deduction: number;
  late_deduction: number;
  net_salary: number;
  total_days: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  overtime_hours: number;
  status: PayrollStatus;
  processed_by: string | null;
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: Profile;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  manager_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  priority?: 'low' | 'medium' | 'high';
  progress: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  department?: Department;
  manager?: Profile;
  project_members?: ProjectMember[];
}

export interface ProjectMember {
  id: string;
  project_id: string;
  employee_id: string;
  role: string;
  joined_at: string;
  employee?: Profile;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  assigned_to: string | null;
  assigned_by: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
  assigner?: Profile;
  project?: Project;
}

export interface JobOpening {
  id: string;
  title: string;
  department_id: string | null;
  description: string | null;
  requirements: string | null;
  experience_required: string | null;
  skills_required: string | null;
  location: string | null;
  salary_range: string | null;
  vacancies: number;
  status: string;
  posted_by: string;
  closing_date: string | null;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface JobApplication {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  resume_url: string | null;
  status: string;
  interview_date: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
  job?: JobOpening;
  applicant?: Profile;
}

export interface Candidate {
  id: string;
  job_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  status: CandidateStatus;
  interview_date: string | null;
  interviewer_id: string | null;
  notes: string | null;
  offer_letter_url: string | null;
  created_at: string;
  updated_at: string;
  job?: JobOpening;
  interviewer?: Profile;
}

export interface Asset {
  id: string;
  name: string;
  asset_code: string;
  category: string;
  description: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  status: AssetStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  return_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
}

export interface AssetHistory {
  id: string;
  asset_id: string;
  action: string;
  employee_id: string | null;
  notes: string | null;
  created_at: string;
  employee?: Profile;
}

export interface PerformanceReview {
  id: string;
  employee_id: string;
  reviewer_id: string;
  review_period_start: string;
  review_period_end: string;
  overall_rating: number | null;
  technical_skills: number | null;
  communication: number | null;
  teamwork: number | null;
  punctuality: number | null;
  leadership: number | null;
  comments: string | null;
  goals_next_period: string | null;
  created_at: string;
  updated_at: string;
  employee?: Profile;
  reviewer?: Profile;
}

export interface KpiGoal {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  employee?: Profile;
}

export interface TrainingProgram {
  id: string;
  title: string;
  description: string | null;
  trainer: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_hours: number | null;
  mode: string;
  max_participants: number | null;
  department_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface TrainingEnrollment {
  id: string;
  training_id: string;
  employee_id: string;
  status: string;
  progress: number;
  completed_at: string | null;
  certificate_url: string | null;
  created_at: string;
  updated_at: string;
  training?: TrainingProgram;
  employee?: Profile;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  department_id: string | null;
  is_global: boolean;
  priority: string;
  posted_by: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  poster?: Profile;
  department?: Department;
}

export interface Document {
  id: string;
  employee_id: string;
  title: string;
  document_type: string;
  file_url: string;
  uploaded_by: string;
  created_at: string;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  department_id: string | null;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  shift_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  shift?: Shift;
  employee?: Profile;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  related_id: string | null;
  related_table: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  actor?: Profile;
}

export interface SupportTicket {
  id: string;
  employee_id: string;
  subject: string;
  description: string;
  status: string;
  priority: TaskPriority;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: Profile;
}

export interface DashboardStats {
  totalEmployees: number;
  totalManagement: number;
  activeEmployees: number;
  totalDepartments: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaveRequests: number;
  monthlyPayrollTotal: number;
  newJoinersThisMonth: number;
  openJobs: number;
}

export type InternStatus = 'created' | 'active' | 'in_progress' | 'completed' | 'expired';

export interface InternDetails {
  id: string;
  profile_id: string;
  college_name: string | null;
  internship_role: string | null;
  mobile_number: string | null;
  start_date: string;
  end_date: string;
  duration_months: number | null;
  reporting_manager_id: string | null;
  status: InternStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  reporting_manager?: Profile;
}
