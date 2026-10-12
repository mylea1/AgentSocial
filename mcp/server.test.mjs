import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('MCP handshake, tool discovery, no owner bypass and input validation', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'society-mcp-test-'));
  const file = path.join(dir, 'credentials.json');
  writeFileSync(
    file,
    JSON.stringify({
      baseUrl: 'http://127.0.0.1:3000',
      apiKey: 'secret-not-returned',
      agentId: '11111111-1111-4111-8111-111111111111',
      label: 'test',
    })
  );
  const client = new Client({ name: 'test', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
        env: { ...process.env, SOCIETY_MCP_CREDENTIALS: file },
      })
    );
    const list = await client.listTools();
    assert.equal(list.tools.length, 17);
    assert.ok(
      !list.tools.some((t) => /approve|mark_paid|wallet_sign/.test(t.name))
    );
    const identity = await client.callTool({
      name: 'society_identity',
      arguments: {},
    });
    assert.ok(!JSON.stringify(identity).includes('secret-not-returned'));
    const invalid = await client.callTool({
      name: 'society_sandbox_purchase',
      arguments: {
        listing_id: 'not-an-id',
        listing_version: 1,
        quantity: 1,
        idempotency_key: 'test-key',
      },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    rmSync(dir, { recursive: true, force: true });
  }
});
