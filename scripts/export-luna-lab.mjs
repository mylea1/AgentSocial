// Export only lab business evidence. Never copy credentials, cookies or environment files.
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  cpSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.local/mcp');
const env = parseEnv(
  readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8').replace(
    /^\uFEFF/,
    ''
  )
);
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const ids = JSON.parse(readFileSync(path.join(local, 'public.json'), 'utf8'));
const agents = [ids.seller.id, ids.buyer.id];
function check(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const out = path.join(
  local,
  'archives',
  new Date().toISOString().replaceAll(':', '-')
);
mkdirSync(out, { recursive: true });
const snapshot = {
  exported_at: new Date().toISOString(),
  scope: 'Local multi-Luna business evidence; virtual funds only',
  agents,
};
for (const [table, column] of [
  ['society_drafts', 'agent_id'],
  ['posts', 'author_id'],
  ['economy_listings', 'seller_agent_id'],
  ['economy_sandbox_orders', 'buyer_agent_id'],
  ['economy_sandbox_wallets', 'agent_id'],
  ['agent_conversations', 'sender_id'],
]) {
  snapshot[table] = check(await db.from(table).select('*').in(column, agents));
}
snapshot.agent_messages = check(
  await db
    .from('agent_messages')
    .select('*')
    .in(
      'conversation_id',
      snapshot.agent_conversations.map((x) => x.id)
    )
    .order('created_at')
);
snapshot.economy_sandbox_wallet_ledger = check(
  await db
    .from('economy_sandbox_wallet_ledger')
    .select('*')
    .in(
      'wallet_id',
      snapshot.economy_sandbox_wallets.map((x) => x.id)
    )
    .order('created_at')
);
writeFileSync(
  path.join(out, 'database.json'),
  JSON.stringify(snapshot, null, 2)
);
for (const dir of ['audit', 'multi-luna', 'order-tests'])
  cpSync(path.join(local, dir), path.join(out, dir), { recursive: true });
for (const name of readdirSync(local).filter((n) =>
  /^sandbox-wallets-test.*\.json$/.test(n)
))
  cpSync(path.join(local, name), path.join(out, name));
const manifest = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else
      manifest.push({
        file: path.relative(out, file).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      });
  }
}
walk(out);
writeFileSync(
  path.join(out, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);
writeFileSync(
  path.join(local, 'latest-archive.json'),
  JSON.stringify({ path: out, files: manifest.length }, null, 2)
);
console.log(
  JSON.stringify({
    path: out,
    files: manifest.length,
    posts: snapshot.posts.length,
    messages: snapshot.agent_messages.length,
    orders: snapshot.economy_sandbox_orders.length,
    ledger_entries: snapshot.economy_sandbox_wallet_ledger.length,
  })
);
