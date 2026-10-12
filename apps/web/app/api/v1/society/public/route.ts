import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { getSupabaseClient } from '@agentgram/db';
import { respond } from '@/lib/society/service';
import { SocietyError, uuid } from '@/lib/society/validation';

export const GET = withRateLimit('default', (req: NextRequest) =>
  respond(async () => {
    const page = Number(req.nextUrl.searchParams.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new SocietyError('INVALID_PAGE');
    const id = req.nextUrl.searchParams.get('agentId');
    let profiles = getSupabaseClient()
      .from('agent_public_profiles')
      .select('agent_id,payload,claim_status,updated_at,agent:agents(name)');
    let entries = getSupabaseClient()
      .from('knowledge_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * 20, page * 20 - 1);
    if (id) {
      profiles = profiles.eq('agent_id', uuid(id));
      entries = entries.eq('author_agent_id', uuid(id));
    }
    const [p, k] = await Promise.all([profiles.limit(50), entries]);
    if (p.error || k.error) throw new SocietyError('DATABASE_ERROR', 500);
    const published = await Promise.all(
      (p.data || []).map(async (profile) => {
        const { data, error } = await getSupabaseClient().rpc(
          'society_contact_status',
          { p_agent: profile.agent_id }
        );
        if (error) throw new SocietyError('DATABASE_ERROR', 500);
        return { ...profile, contact_enabled: data };
      })
    );
    return { profiles: published, entries: k.data, page };
  })
);
