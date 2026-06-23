import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, GitBranch, UserCog, ClipboardList,
  Calendar, DollarSign, Briefcase, FolderKanban, Package, TrendingUp,
  GraduationCap, Megaphone, BarChart3, ScrollText, Settings, LogOut,
  ChevronLeft, ChevronRight, User, Shield, Menu, X,
  UserSquare, ClipboardCheck, Timer, ListTodo, Target, BookOpen,
  FileText, Cpu, HelpCircle, Wallet, Home, Tag, UserCheck, ShieldAlert,
  Video
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/types';
import { NotificationBell } from '@/components/common/NotificationBell';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const directorNav: NavItem[] = [
  { label: 'Dashboard', path: '/director', icon: LayoutDashboard },
  { label: 'Company Overview', path: '/director/company', icon: Building2 },
  { label: 'Employee Management', path: '/director/employees', icon: Users },
  { label: 'Department Management', path: '/director/departments', icon: GitBranch },
  { label: 'Management Accounts', path: '/director/management', icon: UserCog },
  { label: 'Attendance Monitoring', path: '/director/attendance', icon: ClipboardList },
  { label: 'Leave Monitoring', path: '/director/leaves', icon: Calendar },
  { label: 'Leave Type Management', path: '/director/leave-types', icon: Tag },
  { label: 'Payroll Management', path: '/director/payroll', icon: DollarSign },
  { label: 'Recruitment', path: '/director/recruitment', icon: Briefcase },
  { label: 'Project Management', path: '/director/projects', icon: FolderKanban },
  { label: 'Asset Management', path: '/director/assets', icon: Package },
  { label: 'Performance Management', path: '/director/performance', icon: TrendingUp },
  { label: 'Training Management', path: '/director/training', icon: GraduationCap },
  { label: 'Internship Management', path: '/director/internship', icon: UserCheck },
  { label: 'Announcements', path: '/director/announcements', icon: Megaphone },
  { label: 'Meetings', path: '/director/meetings', icon: Video },
  { label: 'Reports & Analytics', path: '/director/reports', icon: BarChart3 },
  { label: 'Activity Logs', path: '/director/logs', icon: ScrollText },
  { label: 'Security Logs', path: '/director/security-logs', icon: ShieldAlert },
  { label: 'Settings', path: '/director/settings', icon: Settings },
];

const managementNav: NavItem[] = [
  { label: 'Dashboard', path: '/management', icon: LayoutDashboard },
  { label: 'Team Management', path: '/management/team', icon: Users },
  { label: 'Employee Directory', path: '/management/directory', icon: UserSquare },
  { label: 'Attendance Management', path: '/management/attendance', icon: ClipboardCheck },
  { label: 'Leave Management', path: '/management/leaves', icon: Calendar },
  { label: 'Shift Management', path: '/management/shifts', icon: Timer },
  { label: 'Task Management', path: '/management/tasks', icon: ListTodo },
  { label: 'Project Management', path: '/management/projects', icon: FolderKanban },
  { label: 'Performance Tracking', path: '/management/performance', icon: Target },
  { label: 'Recruitment', path: '/management/recruitment', icon: Briefcase },
  { label: 'Training', path: '/management/training', icon: GraduationCap },
  { label: 'Asset Tracking', path: '/management/assets', icon: Package },
  { label: 'Internship', path: '/management/internship', icon: UserCheck },
  { label: 'Announcements', path: '/management/announcements', icon: Megaphone },
  { label: 'Meetings', path: '/management/meetings', icon: Video },
  { label: 'Reports', path: '/management/reports', icon: BarChart3 },
  { label: 'My Attendance', path: '/management/my-attendance', icon: ClipboardCheck },
  { label: 'My Leave Requests', path: '/management/my-leaves', icon: FileText },
  { label: 'Settings', path: '/management/settings', icon: Settings },
];

// Interns use the full employee nav — no restrictions
const employeeNav: NavItem[] = [
  { label: 'Dashboard', path: '/employee', icon: Home },
  { label: 'My Profile', path: '/employee/profile', icon: User },
  { label: 'Attendance', path: '/employee/attendance', icon: ClipboardCheck },
  { label: 'My Shifts', path: '/employee/shifts', icon: Timer },
  { label: 'Leave Requests', path: '/employee/leaves', icon: Calendar },
  { label: 'Salary & Payslips', path: '/employee/salary', icon: Wallet },
  { label: 'Career Opportunities', path: '/employee/careers', icon: Briefcase },
  { label: 'Tasks', path: '/employee/tasks', icon: ListTodo },
  { label: 'Projects', path: '/employee/projects', icon: FolderKanban },
  { label: 'Performance', path: '/employee/performance', icon: Target },
  { label: 'Training', path: '/employee/training', icon: BookOpen },
  { label: 'Announcements', path: '/employee/announcements', icon: Megaphone },
  { label: 'My Meetings', path: '/employee/meetings', icon: Video },
  { label: 'Documents', path: '/employee/documents', icon: FileText },
  { label: 'Assigned Assets', path: '/employee/assets', icon: Cpu },
  { label: 'Help & Support', path: '/employee/support', icon: HelpCircle },
  { label: 'Settings', path: '/employee/settings', icon: Settings },
];

function getNavItems(role: UserRole): NavItem[] {
  if (role === 'director') return directorNav;
  if (role === 'management') return managementNav;
  // Employees AND interns both use the full employee nav
  return employeeNav;
}

function getRoleBadgeColor(role: UserRole) {
  if (role === 'director') return 'bg-primary/20 text-primary border-primary/30';
  if (role === 'management') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  return 'bg-green-500/20 text-green-400 border-green-500/30';
}

function getRoleLabel(role: UserRole) {
  if (role === 'director') return 'Director';
  if (role === 'management') return 'Management';
  if (role === 'intern') return 'Intern';
  return 'Employee';
}

interface SidebarContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

function SidebarContent({ collapsed = false, onNavigate }: SidebarContentProps) {
  const { profile, companySettings, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = profile ? getNavItems(profile.role) : [];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-sidebar-border ${collapsed ? 'justify-center px-2' : ''}`}>
        {companySettings?.company_logo_url ? (
          <img src={companySettings.company_logo_url} alt="Logo" className="w-8 h-8 rounded object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">
              {companySettings?.company_name || 'HRM System'}
            </p>
            <p className="text-xs text-muted-foreground">Enterprise HR</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 min-w-0 overflow-y-auto py-3 px-2 space-y-0.5">
        <TooltipProvider delayDuration={0}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/director' && item.path !== '/management' && item.path !== '/employee' && location.pathname.startsWith(item.path));
            return (
              <Tooltip key={item.path} disableHoverableContent>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                      collapsed ? 'justify-center px-2' : ''
                    } ${
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <Icon className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="bg-popover border-border text-foreground">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>

      {/* User Profile */}
      <div className="border-t border-sidebar-border p-3">
        {profile && (
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{profile.full_name || 'User'}</p>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${getRoleBadgeColor(profile.role)}`}>
                  {getRoleLabel(profile.role)}
                </Badge>
              </div>
            )}
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="shrink-0 w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile } = useAuth();
  const isDesktop = typeof window !== 'undefined' && window.electronApp?.isDesktop;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar — fixed height, independent scroll */}
      <aside className={`hidden lg:flex flex-col shrink-0 h-full bg-sidebar border-r border-sidebar-border relative transition-all duration-200 ${collapsed ? 'w-14' : 'w-60'}`}>
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-sidebar-border border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Sidebar — Sheet from left */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main area — independent scroll column */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <header className="h-12 border-b border-border bg-card/50 backdrop-blur flex items-center px-3 md:px-4 gap-2 shrink-0">
          {/* Mobile hamburger — always visible on <lg screens */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden w-8 h-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0" />

          {isDesktop && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              Desktop mode
            </div>
          )}

          {/* Notifications — realtime bell with dropdown */}
          {profile && <NotificationBell />}
        </header>

        {/* Page Content — only this area scrolls */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="page-fade-in min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
