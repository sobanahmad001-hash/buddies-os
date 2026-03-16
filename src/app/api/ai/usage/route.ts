import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get cost summary
    const { data: summary } = await supabase.rpc('get_ai_cost_summary', {
      p_user_id: user.id
    });

    // Get recent usage
    const { data: recentUsage } = await supabase
      .from('ai_usage')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Get model config
    const { data: config } = await supabase
      .from('ai_model_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      summary: summary?.[0] || { today_cost: 0, month_cost: 0, today_messages: 0, month_messages: 0 },
      recent: recentUsage || [],
      config: config || { default_model: 'claude-3-5-sonnet-20241022', auto_select: true }
    });

  } catch (error: any) {
    console.error('Usage API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await request.json();

    const { data, error } = await supabase
      .from('ai_model_config')
      .upsert({
        user_id: user.id,
        ...updates,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ config: data });

  } catch (error: any) {
    console.error('Config Update Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
