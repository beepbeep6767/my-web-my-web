import cron from 'node-cron';
import { mkdir } from 'node:fs/promises';
import { db } from '../db.js';
import { config } from '../config.js';
import { cleanupUnread, cleanupMedia } from './cleanup.js';
import { auditModeration } from './moderation-audit.js';
await mkdir(config.uploadDir, { recursive: true });
await db.$connect();
const running = new Set();
function run(name, action) {
  const promise = (async () => { try { console.log(JSON.stringify({ job: name, at: new Date().toISOString(), result: await action() })); } catch (error) { console.error(name, error); if (process.argv.includes('--once')) process.exitCode = 1; } })();
  running.add(promise); promise.finally(() => running.delete(promise)); return promise;
}
async function cleanup() { return { ...await cleanupUnread(), ...await cleanupMedia() }; }
await run('cleanup', cleanup);
await run('moderation-audit', auditModeration);
if (process.argv.includes('--once')) { await db.$disconnect(); }
else {
  if (!cron.validate(config.CLEANUP_CRON) || !cron.validate(config.MODERATION_AUDIT_CRON)) throw new Error('Invalid cron expression');
  const tasks = [cron.schedule(config.CLEANUP_CRON, () => run('cleanup', cleanup), { noOverlap: true, timezone: 'UTC' }), cron.schedule(config.MODERATION_AUDIT_CRON, () => run('moderation-audit', auditModeration), { noOverlap: true, timezone: 'UTC' })];
  console.log('MNChat jobs running independently of the API.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; for (const task of tasks) await task.stop(); await Promise.allSettled([...running]); await db.$disconnect(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
