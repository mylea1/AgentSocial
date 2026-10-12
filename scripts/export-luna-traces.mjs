// Preserve visible chat/tool evidence, excluding hidden reasoning and credentials.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, '.local/mcp');
const out = path.join(base, 'multi-luna', 'traces', String(Date.now()));
mkdirSync(out, { recursive: true });
const secrets = [];
for (const name of ['seller', 'buyer', 'owners']) {
  const value = JSON.parse(
    readFileSync(path.join(base, name + '.json'), 'utf8')
  );
  if (value.apiKey) secrets.push(value.apiKey);
  for (const who of Object.values(value))
    if (who?.cookie) secrets.push(who.cookie);
}
const env = parseEnv(
  readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8').replace(
    /^\uFEFF/,
    ''
  )
);
for (const [key, value] of Object.entries(env))
  if (/KEY|SECRET|TOKEN|PASSWORD/.test(key) && value.length > 12)
    secrets.push(value);
const sessions = path.join(homedir(), '.codex/sessions/2026/10/12');
const ids = [
  '01a12ed6-2d3a-7f23-901f-4b53afc315db',
  '01a12ed6-3745-7142-8096-a87e154f743d',
  '01a12ed7-051b-7741-8487-83e6465f930a',
];
for (const id of ids) {
  const file = readdirSync(sessions).find((n) => n.endsWith(id + '.jsonl'));
  if (!file) throw new Error('Missing thread trace ' + id);
  const records = [];
  for (const line of readFileSync(path.join(sessions, file), 'utf8')
    .split('\n')
    .filter(Boolean)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const p = event.payload;
    if (
      event.type === 'event_msg' &&
      p?.type === 'item_completed' &&
      [
        'AgentMessage',
        'CommandExecution',
        'McpToolCall',
        'FunctionCallOutput',
        'WebSearch',
      ].includes(p.item?.type)
    )
      records.push(event);
    else if (
      event.type === 'response_item' &&
      [
        'custom_tool_call',
        'custom_tool_call_output',
        'function_call',
        'function_call_output',
      ].includes(p?.type)
    )
      records.push(event);
  }
  let body = JSON.stringify(
    {
      thread_id: id,
      model: 'gpt-6-luna',
      reasoning_effort: 'low',
      exported_at: new Date().toISOString(),
      scope:
        'Visible messages and tool calls; hidden reasoning excluded; credentials redacted',
      records,
    },
    null,
    2
  );
  for (const secret of secrets)
    body = body.replaceAll(secret, '[REDACTED_CREDENTIAL]');
  writeFileSync(path.join(out, id + '.json'), body);
  console.log(JSON.stringify({ thread: id, records: records.length }));
}
console.log('Trace export: ' + out);
