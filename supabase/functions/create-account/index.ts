import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the caller is authenticated and is a director
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get caller profile to check role
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'director') {
      return new Response(JSON.stringify({ error: 'Only directors can create accounts' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const {
      identifier: rawIdentifier, // username or email
      password,
      role, // 'management' | 'employee'
      full_name,
      phone,
      department_id,
      designation,
      employee_id,
      date_of_joining,
    } = await req.json();

    const identifier = (rawIdentifier || '').toString().trim();

    if (!identifier || !password || !role || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!['management', 'employee'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role. Only management or employee allowed.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (identifier.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use @miaoda.com convention
    const email = identifier.includes('@') ? identifier : `${identifier}@miaoda.com`;

    // Create auth user with role in metadata
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update profile with full details (trigger already inserted basic row)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        phone: phone || null,
        role,
        department_id: department_id || null,
        designation: designation || null,
        employee_id: employee_id || null,
        date_of_joining: date_of_joining || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
    }

    // Initialize leave balances for the new employee
    if (role === 'employee' || role === 'management') {
      const { data: leaveTypes } = await supabaseAdmin.from('leave_types').select('id, max_days_per_year');
      if (leaveTypes && leaveTypes.length > 0) {
        const currentYear = new Date().getFullYear();
        const balances = leaveTypes.map((lt: { id: string; max_days_per_year: number }) => ({
          employee_id: newUser.user.id,
          leave_type_id: lt.id,
          year: currentYear,
          total_days: lt.max_days_per_year,
          used_days: 0,
        }));
        await supabaseAdmin.from('leave_balances').insert(balances);
      }
    }

    // Log activity
    await supabaseAdmin.from('activity_logs').insert({
      actor_id: callerUser.id,
      action: 'create_account',
      entity_type: 'profiles',
      entity_id: newUser.user.id,
      description: `Created ${role} account for ${full_name}`,
    });

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id, email }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('create-account error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
