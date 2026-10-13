// Publish retained local test evidence, never authentication material.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-evidence', '2026-10-13');
const env = parseEnv(
  readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8').replace(
    /^\uFEFF/,
    ''
  )
);
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321')
  throw new Error('Local database required');
const sensitive =
  /password|secret|cookie|authorization|credential|api.?key|access.?token|refresh.?token|key_hash|signature/i;
const secrets = new Set(
  Object.entries(env)
    .filter(([k, v]) => sensitive.test(k) && v.length > 8)
    .map(([, v]) => v)
);
const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
}
walk(path.join(root, '.local'));
function harvest(v) {
  if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v)) {
    if (sensitive.test(k) && typeof x === 'string' && x.length > 8)
      secrets.add(x);
    else harvest(x);
  }
}
for (const file of files)
  if (file.endsWith('.json')) {
    try {
      harvest(JSON.parse(readFileSync(file, 'utf8')));
    } catch {}
  }
function scrub(text) {
  for (const secret of [...secrets].sort((a, b) => b.length - a.length))
    text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/\bag_[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[REDACTED_JWT]'
    )
    .replace(/\$2[aby]\$\d+\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]');
}
function clean(v) {
  if (typeof v === 'string') return scrub(v);
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        sensitive.test(k) ? '[REDACTED]' : clean(x),
      ])
    );
  return v;
}
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ids = new Set();
const manifest = [];
function save(relative, text) {
  const target = path.join(out, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
  manifest.push({
    file: relative.replaceAll('\\', '/'),
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  });
}
for (const file of files) {
  if (!/\.(json|jsonl|log|md|sql|txt)$/.test(file)) continue;
  const relative = path.relative(path.join(root, '.local'), file);
  let raw = readFileSync(file, 'utf8');
  // Keep fixture references even when a credential file itself is fully redacted.
  for (const id of raw.match(uuid) || []) ids.add(id.toLowerCase());
  if (file.endsWith('.json')) {
    try {
      raw = JSON.stringify(clean(JSON.parse(raw)), null, 2) + '\n';
    } catch {
      raw = scrub(raw);
    }
  } else if (file.endsWith('.jsonl'))
    raw = raw
      .split('\n')
      .map((line) => {
        try {
          return JSON.stringify(clean(JSON.parse(line)));
        } catch {
          return scrub(line);
        }
      })
      .join('\n');
  else raw = scrub(raw);
  save(path.join('local', relative), raw);
}
const docker = 'D:\\agent-society-tools\\Docker\\resources\\bin\\docker.exe';
function sql(query) {
  return execFileSync(
    docker,
    [
      'exec',
      'supabase_db_agentgram',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  ).trim();
}
const excluded =
  /^(api_keys|agent_claim_tokens|agent_request_signature_nonces|developer_members|subscriptions|webhook_events|ax_|axp_|rate_limits)/;
const tables = sql(
  "select tablename from pg_tables where schemaname='public' order by tablename"
)
  .split('\n')
  .filter((t) => !excluded.test(t));
const snapshot = {
  exported_at: new Date().toISOString(),
  scope:
    'Rows referencing UUIDs retained in local test evidence. Authentication tables excluded; secrets redacted.',
  tables: {},
};
for (const table of tables) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
  const lines = sql(`select row_to_json(t) from public."${table}" t`);
  const rows = lines ? lines.split('\n').map((x) => JSON.parse(x)) : [];
  snapshot.tables[table] = rows
    .filter((row) =>
      (JSON.stringify(row).match(uuid) || []).some((id) =>
        ids.has(id.toLowerCase())
      )
    )
    .map(clean);
}
save('database.json', JSON.stringify(snapshot, null, 2) + '\n');
save(
  'README.md',
  '# Retained local test evidence\n\nIncludes successful and failed runs, HTTP/MCP/RPC logs, fixtures, and matching database business records. Virtual funds only. Original local files remain unchanged. Authentication tables are excluded; credentials, cookies, secrets and password hashes are redacted. This is an audit snapshot, not a restorable authentication/database backup. No private Codex reasoning is collected.\n'
);
writeFileSync(
  path.join(out, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    output: out,
    files: manifest.length,
    rows: Object.fromEntries(
      Object.entries(snapshot.tables).map(([k, v]) => [k, v.length])
    ),
  })
);
