import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!url.pathname.endsWith('_test')) url.pathname += '_test';
const test = new URL('../server/tests/integration.test.js', import.meta.url);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', fileURLToPath(test)], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString() } });
process.exit(result.status ?? 1);
