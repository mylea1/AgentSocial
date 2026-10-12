import { existsSync, readFileSync, cpSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'apps/web');
const envFile = path.join(web, '.env.local');
if (existsSync(envFile))
  Object.assign(
    process.env,
    parseEnv(readFileSync(envFile, 'utf8').replace(/^\uFEFF/, ''))
  );
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321')
  throw new Error('This launcher is restricted to local Supabase');
const target = path.join(web, '.next/standalone/apps/web');
if (!existsSync(path.join(target, 'server.js')))
  throw new Error('Run the web production build first');
cpSync(path.join(web, '.next/static'), path.join(target, '.next/static'), {
  recursive: true,
});
if (existsSync(path.join(web, 'public')))
  cpSync(path.join(web, 'public'), path.join(target, 'public'), {
    recursive: true,
  });
process.env.NODE_ENV = 'production';
process.env.RATE_LIMIT_BACKEND = 'postgres';
process.env.HOSTNAME = '127.0.0.1';
process.env.PORT = process.env.SOCIETY_PORT || '3000';
await import(pathToFileURL(path.join(target, 'server.js')).href);
