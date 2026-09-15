import 'dotenv/config';
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
dotenv.config({ path: new URL('../.env', import.meta.url) });
const cli = new URL('../node_modules/prisma/build/index.js', import.meta.url);
const result = spawnSync(process.execPath, [cli.pathname, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
