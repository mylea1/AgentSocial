import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = parseEnv(
  (await readFile(path.join(root, 'apps/web/.env.local'), 'utf8')).replace(
    /^\uFEFF/,
    ''
  )
);
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const evidenceDirectory = path.join(
  root,
  '.local/functional-tests',
  'disabled-' + Date.now()
);
await mkdir(evidenceDirectory, { recursive: true });
const output = createWriteStream(path.join(evidenceDirectory, 'server.log'));
const child = spawn(
  process.execPath,
  [path.join(root, 'apps/web/.next/standalone/apps/web/server.js')],
  {
    cwd: root,
    env: {
      ...process.env,
      ...env,
      PORT: '3001',
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      RATE_LIMIT_BACKEND: 'postgres',
      SOCIETY_INFERENCE_SANDBOX: 'false',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
child.stdout.pipe(output);
child.stderr.pipe(output);
const result = { status: 'failed' };
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(
        'http://127.0.0.1:3001/.well-known/agent-card.json'
      );
      if (r.status === 404) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(ready, 'disabled server should start');
  assert.equal(
    (await fetch('http://127.0.0.1:3001/api/v1/society/inference/services'))
      .status,
    404
  );
  assert.equal(
    (await fetch('http://127.0.0.1:3001/api/v1/society/community')).status,
    200
  );
  assert.equal((await fetch('http://127.0.0.1:3001/society')).status, 200);
  result.status = 'passed';
  result.checks = [
    'inference discovery disabled',
    'A2A card disabled',
    'free community API and page available',
  ];
} finally {
  child.kill();
  output.end();
  await writeFile(
    path.join(evidenceDirectory, 'result.json'),
    JSON.stringify(result, null, 2)
  );
  console.log({ ...result, evidence: evidenceDirectory });
}
