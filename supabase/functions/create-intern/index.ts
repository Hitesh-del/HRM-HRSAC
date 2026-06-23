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

    // Verify caller is authenticated
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

    // Verify caller is director or management
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, department_id')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (!callerProfile || !['director', 'management'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Only directors or managers can create intern accounts' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const {
      email,
      password,
      full_name,
      mobile_number,
      department_id,
      internship_role,
      college_name,
      start_date,
      end_date,
      reporting_manager_id,
      notes,
    } = await req.json();

    if (!email || !password || !full_name || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: 'email, password, full_name, start_date, and end_date are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Generate unique INT-XXXX employee_id ---
    // Query max existing INT- id to avoid collisions regardless of COUNT
    const { data: maxRow } = await supabaseAdmin
      .from('profiles')
      .select('employee_id')
      .like('employee_id', 'INT%')
      .order('employee_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNum = 1;
    if (maxRow?.employee_id) {
      const match = maxRow.employee_id.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const internEmployeeId = `INT${String(nextNum).padStart(4, '0')}`;

    // Double-check uniqueness — retry up to 5 times if collision found
    let finalInternId = internEmployeeId;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('employee_id', finalInternId)
        .maybeSingle();
      if (!existing) break;
      nextNum += 1;
      finalInternId = `INT${String(nextNum).padStart(4, '0')}`;
    }

    // --- Create auth user using service_role admin (never hijacks current session) ---
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { role: 'intern', full_name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = newUser.user.id;

    // --- Update profile (trigger already inserted a bare row) ---
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        email: email.trim(),
        phone: mobile_number || null,
        role: 'intern',
        department_id: department_id || null,
        employee_id: finalInternId,
        designation: internship_role || 'Intern',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      // Roll back: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: `Profile update failed: ${profileError.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Calculate duration in months ---
    const start = new Date(start_date);
    const end = new Date(end_date);
    const durationMonths = parseFloat(
      (((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44))).toFixed(1)
    );

    // --- Insert intern_details ---
    const { error: detailsError } = await supabaseAdmin
      .from('intern_details')
      .insert({
        profile_id: userId,
        college_name: college_name || null,
        internship_role: internship_role || null,
        mobile_number: mobile_number || null,
        start_date,
        end_date,
        duration_months: durationMonths,
        reporting_manager_id: reporting_manager_id || null,
        notes: notes || null,
        status: 'created',
        created_by: callerUser.id,
      });

    if (detailsError) {
      // Roll back: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: `Intern details insert failed: ${detailsError.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Log activity ---
    await supabaseAdmin.from('activity_logs').insert({
      actor_id: callerUser.id,
      action: 'create_intern',
      entity_type: 'profiles',
      entity_id: userId,
      description: `Created intern account for ${full_name} (${finalInternId})`,
    });

    return new Response(
      JSON.stringify({ success: true, user_id: userId, employee_id: finalInternId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('create-intern error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
