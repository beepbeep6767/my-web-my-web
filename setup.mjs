import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const root = new URL('../', import.meta.url);
const target = new URL('.env', root);
if (existsSync(target)) { console.log('.env already exists; left unchanged.'); process.exit(0); }
const password = randomBytes(18).toString('hex');
const source = readFileSync(new URL('.env.example', root), 'utf8')
  .replaceAll('CHANGE_ME', password)
  .replace('REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES', randomBytes(48).toString('hex'));
writeFileSync(target, source, { mode: 0o600 });
console.log('Created .env with fresh local credentials. Start PostgreSQL, then run npm run db:deploy.');
