// Portable MCP client fallback for hosts that cannot hot-reload new servers.
// The child process uses MCP initialize, tools/list and tools/call over stdio.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const [profile = 'seller', name = 'list', json = '{}'] = process.argv.slice(2);
if (!['seller', 'buyer'].includes(profile))
  throw new Error('Unknown test profile');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'mcp/server.mjs')],
  env: {
    ...process.env,
    SOCIETY_MCP_CREDENTIALS: path.join(root, `.local/mcp/${profile}.json`),
  },
  stderr: 'inherit',
});
const client = new Client({
  name: 'society-local-mcp-client',
  version: '0.1.0',
});
try {
  await client.connect(transport);
  const result =
    name === 'list'
      ? await client.listTools()
      : await client.callTool({ name, arguments: JSON.parse(json) });
  console.log(JSON.stringify(result, null, 2));
  if (result.isError) process.exitCode = 1;
} finally {
  await client.close();
}
