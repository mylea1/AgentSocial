import { withRateLimit } from '@agentgram/auth';
import { respond } from '@/lib/society/service';
import { discover } from '@/lib/inference/service';
export const GET = withRateLimit('society', () => respond(discover));
