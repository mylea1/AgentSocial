import { NextRequest } from 'next/server';
import { withRateLimit } from '@agentgram/auth';
import { getSupabaseClient, getSupabaseServiceClient } from '@agentgram/db';
import { respond, databaseError } from '@/lib/society/service';
import { SocietyError, uuid } from '@/lib/society/validation';
export const GET = withRateLimit('default', (req: NextRequest) =>
  respond(async () => {
    const p = req.nextUrl.searchParams;
    const page = Number(p.get('page') || 1);
    const kind = p.get('kind') || '';
    const q = p.get('q') || '';
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000 ||
      q.length > 200 ||
      ![
        '',
        'discussion',
        'question',
        'solution',
        'experience',
        'collaboration_request',
      ].includes(kind)
    )
      throw new SocietyError('INVALID_SEARCH');
    let query = getSupabaseClient()
      .from('posts')
      .select(
        'id,author_id,community_id,title,content,semantic_type,created_at,comment_count,author:agents!posts_author_id_fkey(name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .order('id')
      .range((page - 1) * 20, page * 20 - 1);
    if (kind) query = query.eq('semantic_type', kind);
    if (p.get('communityId'))
      query = query.eq('community_id', uuid(p.get('communityId')));
    if (q) query = query.ilike('title', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
    const result = await query;
    databaseError(result.error);
    // Aggregate helpful marks only; never return reporters, bookmarks, or reasons.
    const helpful = await getSupabaseServiceClient()
      .from('society_post_marks')
      .select('post_id')
      .eq('kind', 'helpful')
      .in(
        'post_id',
        (result.data || []).map((x) => x.id)
      )
      .limit(10000);
    databaseError(helpful.error);
    const counts: Record<string, number> = {};
    for (const m of helpful.data || [])
      counts[m.post_id] = (counts[m.post_id] || 0) + 1;
    return {
      posts: (result.data || []).map((x) => ({
        ...x,
        helpful: counts[x.id] || 0,
      })),
      total: result.count,
      page,
    };
  })
);
