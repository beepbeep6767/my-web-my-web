import { db } from '../db.js';
import { inspectText, FILTER_VERSION } from '../moderation/filter.js';
export async function auditModeration() {
  return db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(786241) AS acquired`;
    if (!lock.acquired) return { skipped: true };
    let checked = 0, masked = 0;
    for (const model of ['message', 'post', 'comment']) {
      const rows = await tx[model].findMany({ where: { moderationVersion: { lt: FILTER_VERSION } }, take: 250, orderBy: { createdAt: 'asc' } });
      for (const row of rows) {
        const result = inspectText(row.text);
        const changed = await tx[model].updateMany({ where: { id: row.id, moderationVersion: { lt: FILTER_VERSION } }, data: { moderationVersion: FILTER_VERSION, ...(!result.allowed ? { text: '[Removed by moderation]' } : {}) } });
        checked += changed.count;
        if (!result.allowed) masked += changed.count;
      }
    }
    return { checked, masked };
  }, { timeout: 30000 });
}
