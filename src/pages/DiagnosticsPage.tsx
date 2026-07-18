import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function DiagnosticsPage() {
  const { user, profile, loading } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string>('');
  const [fetchLoading, setFetchLoading] = useState(false);

  const testEmployeesFetch = async () => {
    setFetchLoading(true);
    setError('');
    try {
      const { data, error: err, status } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('role', 'employee')
        .limit(5);
      
      if (err) {
        setError(`Error (${status}): ${err.message}`);
      } else {
        setEmployees(data || []);
      }
    } catch (e) {
      setError(`Exception: ${(e as any).message}`);
    } finally {
      setFetchLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Diagnostics</h1>
      
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Auth Info</h2>
        <div className="space-y-2 text-sm">
          <p><strong>User ID:</strong> {user?.id || 'Not authenticated'}</p>
          <p><strong>User Email:</strong> {user?.email || 'N/A'}</p>
          <p><strong>Profile ID:</strong> {profile?.id || 'Not loaded'}</p>
          <p><strong>Profile Role:</strong> <span className="font-mono bg-muted px-2 py-1 rounded">{profile?.role || 'N/A'}</span></p>
          <p><strong>Full Name:</strong> {profile?.full_name || 'N/A'}</p>
          <p><strong>Department ID:</strong> {profile?.department_id || 'N/A'}</p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Employee Fetch Test</h2>
        {profile?.role === 'director' ? (
          <>
            <Button onClick={testEmployeesFetch} disabled={fetchLoading} className="mb-4">
              {fetchLoading ? 'Fetching...' : 'Test Employee Query'}
            </Button>
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive px-3 py-2 rounded text-sm mb-4">
                {error}
              </div>
            )}
            {employees.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold mb-2">Fetched {employees.length} employees:</p>
                <ul className="space-y-1">
                  {employees.map(e => (
                    <li key={e.id} className="font-mono text-xs bg-muted p-1 rounded">
                      {e.full_name} ({e.email})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">Only directors can see this test.</p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Check Database Role</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Go to Supabase Dashboard → profiles table → find your user and verify the role column is set to 'director' (not 'employee' or NULL).
        </p>
        <Button 
          variant="outline" 
          onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
          className="text-sm"
        >
          Open Supabase Dashboard
        </Button>
      </Card>
    </div>
  );
}
