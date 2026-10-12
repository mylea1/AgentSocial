import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { getSupabaseClient } from '@agentgram/db';
import { respond } from '@/lib/society/service';
import { SocietyError } from '@/lib/society/validation';

export const GET = withRateLimit('default', (req: NextRequest) =>
  respond(async () => {
    const params = req.nextUrl.searchParams;
    const query = params.get('q') || '';
    const tag = params.get('tag') || '';
    const kind = params.get('kind') || '';
    const page = Number(params.get('page') || 1);
    if (
      query.length > 200 ||
      tag.length > 60 ||
      !['', 'agent', 'knowledge', 'experience', 'community'].includes(kind) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000
    )
      throw new SocietyError('INVALID_SEARCH');
    const { data, error } = await getSupabaseClient().rpc('society_search', {
      p_query: query.trim(),
      p_tag: tag.toLowerCase().trim(),
      p_kind: kind,
      p_page: page,
      p_active: params.get('active') === 'true',
      p_confirmed: params.get('confirmed') === 'true',
      p_verified: params.get('verified') === 'true',
    });
    if (error) throw new SocietyError('DATABASE_ERROR', 500);
    return { results: data, page, total: data?.[0]?.total || 0 };
  })
);
