import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { routes } from '@/routes';

interface RouteGuardProps {
  children: React.ReactNode;
}

const SYSTEM_PUBLIC_ROUTES = ['/login', '/setup', '/forgot-password', '/403', '/404'];
const routePublicPaths = routes.filter(r => r.public).map(r => r.path);
const PUBLIC_ROUTES = [...new Set([...SYSTEM_PUBLIC_ROUTES, ...routePublicPaths])];

function getDashboard(role: string) {
  if (role === 'director') return '/director';
  if (role === 'management') return '/management';
  return '/employee';
}

function matchPublicRoute(path: string, patterns: string[]) {
  return patterns.some(pattern => {
    if (pattern.includes('*')) {
      return new RegExp('^' + pattern.replace('*', '.*') + '$').test(path);
    }
    return path === pattern;
  });
}

export function RouteGuard({ children }: RouteGuardProps) {
  const { user, profile, loading, otpPending } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    const isPublic = matchPublicRoute(location.pathname, PUBLIC_ROUTES);

    if (!user && !isPublic) {
      navigate('/login', { state: { from: location.pathname }, replace: true });
      return;
    }

    // While OTP verification is pending (new device check in progress),
    // do NOT redirect a temporarily-authenticated user away from login.
    // The session will be cleared by LoginPage once device check finishes.
    if (otpPending) return;

    // Redirect logged-in user away from auth pages
    if (user && profile && isPublic) {
      navigate(getDashboard(profile.role), { replace: true });
      return;
    }

    // Role-based guard: prevent wrong-panel access
    if (user && profile) {
      const path = location.pathname;
      const role = profile.role;
      if (path.startsWith('/director') && role !== 'director') {
        navigate(getDashboard(role), { replace: true });
      } else if (path.startsWith('/management') && role !== 'management') {
        navigate(getDashboard(role), { replace: true });
      } else if (path.startsWith('/employee') && role !== 'employee' && role !== 'intern') {
        navigate(getDashboard(role), { replace: true });
      }
    }
  }, [user, profile, loading, otpPending, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}