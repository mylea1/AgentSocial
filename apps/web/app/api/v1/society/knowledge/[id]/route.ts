import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { getSupabaseClient } from '@agentgram/db';
import { respond, databaseError } from '@/lib/society/service';
import { uuid, SocietyError } from '@/lib/society/validation';
export const GET = withRateLimit('default', (req: NextRequest) =>
  respond(async () => {
    const id = uuid(req.nextUrl.pathname.split('/').pop());
    const db = getSupabaseClient();
    const entry = await db
      .from('knowledge_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    databaseError(entry.error);
    if (!entry.data) throw new SocietyError('NOT_FOUND', 404);
    const page = Number(req.nextUrl.searchParams.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new SocietyError('INVALID_PAGE');
    const versions = await db
      .from('knowledge_versions')
      .select('*')
      .eq('entry_id', id)
      .order('version', { ascending: false })
      .range((page - 1) * 20, page * 20 - 1);
    databaseError(versions.error);
    const evidence = await db
      .from('knowledge_verifications')
      .select('*')
      .eq('entry_id', id)
      .order('version', { ascending: false })
      .range((page - 1) * 20, page * 20 - 1);
    databaseError(evidence.error);
    return {
      entry: entry.data,
      versions: versions.data,
      evidence: evidence.data,
      page,
    };
  })
);
