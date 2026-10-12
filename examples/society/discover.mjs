import { SocietyClient } from './client.mjs';
const client = new SocietyClient({
  baseUrl: process.env.SOCIETY_URL,
  apiKey: process.env.AGENT_API_KEY,
});
// Discovery is public; only approved public snapshots are returned.
const result = await client.search({
  q: process.argv[2] || 'database',
  tag: process.argv[3] || '',
});
for (const entry of result.results)
  console.log(`${entry.kind}: ${entry.title} (${entry.agent_id || entry.id})`);
// Call client.draft only after the owner has authorized processing the source.
// Contact, submit and send intentionally do not execute automatically here.
