import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';

// Auth pages
import FirstTimeSetupPage from '@/pages/auth/FirstTimeSetupPage';
import LoginPage from '@/pages/auth/LoginPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';

// Director pages
import DirectorDashboard from '@/pages/director/DirectorDashboard';
import CompanyOverview from '@/pages/director/CompanyOverview';
import EmployeeManagement from '@/pages/director/EmployeeManagement';
import DepartmentManagement from '@/pages/director/DepartmentManagement';
import ManagementAccounts from '@/pages/director/ManagementAccounts';
import AttendanceMonitoring from '@/pages/director/AttendanceMonitoring';
import LeaveMonitoring from '@/pages/director/LeaveMonitoring';
import LeaveTypeManagement from '@/pages/director/LeaveTypeManagement';
import PayrollManagement from '@/pages/director/PayrollManagement';
import RecruitmentPage from '@/pages/director/RecruitmentPage';
import ProjectManagement from '@/pages/director/ProjectManagement';
import AssetManagement from '@/pages/director/AssetManagement';
import PerformanceManagement from '@/pages/director/PerformanceManagement';
import TrainingManagement from '@/pages/director/TrainingManagement';
import AnnouncementsPage from '@/pages/director/AnnouncementsPage';
import ReportsAnalytics from '@/pages/director/ReportsAnalytics';
import ActivityLogs from '@/pages/director/ActivityLogs';
import SecurityLogsPage from '@/pages/director/SecurityLogsPage';
import DirectorSettings from '@/pages/director/DirectorSettings';

import DirectorInternship from '@/pages/director/DirectorInternship';
import MeetingManagement from '@/pages/director/MeetingManagement';
import MgmtMeetings from '@/pages/management/MgmtMeetings';
import SamplePage from '@/pages/SamplePage';

// Management pages
import ManagementDashboard from '@/pages/management/ManagementDashboard';
import TeamManagement from '@/pages/management/TeamManagement';
import EmployeeDirectory from '@/pages/management/EmployeeDirectory';
import MgmtAttendance from '@/pages/management/MgmtAttendance';
import MgmtLeaves from '@/pages/management/MgmtLeaves';
import ShiftManagement from '@/pages/management/ShiftManagement';
import TaskManagement from '@/pages/management/TaskManagement';
import MgmtProjects from '@/pages/management/MgmtProjects';
import MgmtPerformance from '@/pages/management/MgmtPerformance';
import MgmtRecruitment from '@/pages/management/MgmtRecruitment';
import MgmtTraining from '@/pages/management/MgmtTraining';
import MgmtAssetTracking from '@/pages/management/MgmtAssetTracking';
import MgmtAnnouncements from '@/pages/management/MgmtAnnouncements';
import MgmtReports from '@/pages/management/MgmtReports';
import MgmtSettings from '@/pages/management/MgmtSettings';
import MgmtMyAttendance from '@/pages/management/MgmtMyAttendance';
import MgmtMyLeaves from '@/pages/management/MgmtMyLeaves';
import MyShifts from '@/pages/employee/MyShifts';

import MgmtInternship from '@/pages/management/MgmtInternship';

// Employee pages
import EmployeeDashboard from '@/pages/employee/EmployeeDashboard';
import MyProfile from '@/pages/employee/MyProfile';
import MyAttendance from '@/pages/employee/MyAttendance';
import MyLeaves from '@/pages/employee/MyLeaves';
import MySalary from '@/pages/employee/MySalary';
import CareerOpportunities from '@/pages/employee/CareerOpportunities';
import MyTasks from '@/pages/employee/MyTasks';
import MyProjects from '@/pages/employee/MyProjects';
import MyPerformance from '@/pages/employee/MyPerformance';
import MyTraining from '@/pages/employee/MyTraining';
import EmpAnnouncements from '@/pages/employee/EmpAnnouncements';
import MyDocuments from '@/pages/employee/MyDocuments';
import AssignedAssets from '@/pages/employee/AssignedAssets';
import HelpSupport from '@/pages/employee/HelpSupport';
import EmpSettings from '@/pages/employee/EmpSettings';
import MyMeetings from '@/pages/employee/MyMeetings';
import NotificationsPage from '@/pages/common/NotificationsPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

const wrap = (el: ReactNode) => <AppLayout>{el}</AppLayout>;

export const routes: RouteConfig[] = [
  // Root redirect
  { name: 'Root', path: '/', element: <Navigate to="/login" replace />, public: true },

  // Auth
  { name: 'Setup', path: '/setup', element: <FirstTimeSetupPage />, public: true },
  { name: 'Login', path: '/login', element: <LoginPage />, public: true },
  { name: 'Forgot Password', path: '/forgot-password', element: <ForgotPasswordPage />, public: true },
  { name: 'Reset Password', path: '/reset-password', element: <ResetPasswordPage />, public: true },

  // Director Panel
  { name: 'Director Dashboard', path: '/director', element: wrap(<DirectorDashboard />) },
  { name: 'Company Overview', path: '/director/company', element: wrap(<CompanyOverview />) },
  { name: 'Employee Management', path: '/director/employees', element: wrap(<EmployeeManagement />) },
  { name: 'Department Management', path: '/director/departments', element: wrap(<DepartmentManagement />) },
  { name: 'Management Accounts', path: '/director/management', element: wrap(<ManagementAccounts />) },
  { name: 'Attendance Monitoring', path: '/director/attendance', element: wrap(<AttendanceMonitoring />) },
  { name: 'Leave Monitoring', path: '/director/leaves', element: wrap(<LeaveMonitoring />) },
  { name: 'Leave Type Management', path: '/director/leave-types', element: wrap(<LeaveTypeManagement />) },
  { name: 'Payroll Management', path: '/director/payroll', element: wrap(<PayrollManagement />) },
  { name: 'Recruitment', path: '/director/recruitment', element: wrap(<RecruitmentPage />) },
  { name: 'Project Management', path: '/director/projects', element: wrap(<ProjectManagement />) },
  { name: 'Asset Management', path: '/director/assets', element: wrap(<AssetManagement />) },
  { name: 'Performance Management', path: '/director/performance', element: wrap(<PerformanceManagement />) },
  { name: 'Training Management', path: '/director/training', element: wrap(<TrainingManagement />) },
  { name: 'Internship Management', path: '/director/internship', element: wrap(<DirectorInternship />) },
  { name: 'Announcements', path: '/director/announcements', element: wrap(<AnnouncementsPage />) },
  { name: 'Meetings', path: '/director/meetings', element: wrap(<MeetingManagement />) },
  { name: 'Reports & Analytics', path: '/director/reports', element: wrap(<ReportsAnalytics />) },
  { name: 'Activity Logs', path: '/director/logs', element: wrap(<ActivityLogs />) },
  { name: 'Security Logs', path: '/director/security-logs', element: wrap(<SecurityLogsPage />) },
  { name: 'Director Settings', path: '/director/settings', element: wrap(<DirectorSettings />) },
  { name: 'Notifications', path: '/director/notifications', element: wrap(<NotificationsPage />) },
  { name: 'Sample Page', path: '/sample', element: wrap(<SamplePage />) },

  // Management Panel
  { name: 'Management Dashboard', path: '/management', element: wrap(<ManagementDashboard />) },
  { name: 'Team Management', path: '/management/team', element: wrap(<TeamManagement />) },
  { name: 'Employee Directory', path: '/management/directory', element: wrap(<EmployeeDirectory />) },
  { name: 'Attendance', path: '/management/attendance', element: wrap(<MgmtAttendance />) },
  { name: 'Leave Management', path: '/management/leaves', element: wrap(<MgmtLeaves />) },
  { name: 'Shift Management', path: '/management/shifts', element: wrap(<ShiftManagement />) },
  { name: 'Task Management', path: '/management/tasks', element: wrap(<TaskManagement />) },
  { name: 'Project Management', path: '/management/projects', element: wrap(<MgmtProjects />) },
  { name: 'Performance Tracking', path: '/management/performance', element: wrap(<MgmtPerformance />) },
  { name: 'Recruitment', path: '/management/recruitment', element: wrap(<MgmtRecruitment />) },
  { name: 'Training', path: '/management/training', element: wrap(<MgmtTraining />) },
  { name: 'Asset Tracking', path: '/management/assets', element: wrap(<MgmtAssetTracking />) },
  { name: 'Internship', path: '/management/internship', element: wrap(<MgmtInternship />) },
  { name: 'Announcements', path: '/management/announcements', element: wrap(<MgmtAnnouncements />) },
  { name: 'Meetings', path: '/management/meetings', element: wrap(<MgmtMeetings />) },
  { name: 'Reports', path: '/management/reports', element: wrap(<MgmtReports />) },
  { name: 'My Attendance', path: '/management/my-attendance', element: wrap(<MgmtMyAttendance />) },
  { name: 'My Leave Requests', path: '/management/my-leaves', element: wrap(<MgmtMyLeaves />) },
  { name: 'Management Settings', path: '/management/settings', element: wrap(<MgmtSettings />) },
  { name: 'Notifications', path: '/management/notifications', element: wrap(<NotificationsPage />) },

  // Employee Panel
  { name: 'Employee Dashboard', path: '/employee', element: wrap(<EmployeeDashboard />) },
  { name: 'My Profile', path: '/employee/profile', element: wrap(<MyProfile />) },
  { name: 'Attendance', path: '/employee/attendance', element: wrap(<MyAttendance />) },
  { name: 'Leave Requests', path: '/employee/leaves', element: wrap(<MyLeaves />) },
  { name: 'Salary & Payslips', path: '/employee/salary', element: wrap(<MySalary />) },
  { name: 'Career Opportunities', path: '/employee/careers', element: wrap(<CareerOpportunities />) },
  { name: 'My Tasks', path: '/employee/tasks', element: wrap(<MyTasks />) },
  { name: 'My Projects', path: '/employee/projects', element: wrap(<MyProjects />) },
  { name: 'Performance', path: '/employee/performance', element: wrap(<MyPerformance />) },
  { name: 'Training', path: '/employee/training', element: wrap(<MyTraining />) },
  { name: 'My Shifts', path: '/employee/shifts', element: wrap(<MyShifts />) },
  { name: 'Announcements', path: '/employee/announcements', element: wrap(<EmpAnnouncements />) },
  { name: 'My Meetings', path: '/employee/meetings', element: wrap(<MyMeetings />) },
  { name: 'Documents', path: '/employee/documents', element: wrap(<MyDocuments />) },
  { name: 'Assigned Assets', path: '/employee/assets', element: wrap(<AssignedAssets />) },
  { name: 'Help & Support', path: '/employee/support', element: wrap(<HelpSupport />) },
  { name: 'Employee Settings', path: '/employee/settings', element: wrap(<EmpSettings />) },
  { name: 'Notifications', path: '/employee/notifications', element: wrap(<NotificationsPage />) },
];
