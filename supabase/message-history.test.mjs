import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshMessages } from '../src/messageHistory.js';
const message = (id, second, extra = {}) => ({ id, createdAt: `2026-10-06T12:00:${String(second).padStart(2, '0')}Z`, ...extra });
test('refresh keeps a realtime arrival at the end, rather than above fetched messages', () => {
  const previous = [message('a', 1), message('b', 2), message('c', 3)];
  assert.deepEqual(refreshMessages(previous, [message('a', 1), message('b', 2)]).map(m => m.id), ['a', 'b', 'c']);
});
test('refresh preserves older pagination, updates receipts and removes missing rows inside the fetched range', () => {
  const previous = [message('old', 0), message('a', 1), message('removed', 2), message('b', 3)];
  const result = refreshMessages(previous, [message('a', 1, { readAt: 'now' }), message('b', 3)]);
  assert.deepEqual(result.map(m => m.id), ['old', 'a', 'b']);
  assert.equal(result[1].readAt, 'now');
});
test('equal timestamps use IDs consistently and never duplicate messages', () => {
  assert.deepEqual(refreshMessages([message('b', 1)], [message('a', 1)]).map(m => m.id), ['a', 'b']);
  assert.deepEqual(refreshMessages([message('a', 1)], [message('a', 1)]).map(m => m.id), ['a']);
  assert.deepEqual(refreshMessages([message('a', 1)], []), []);
});
test('pagination keeps messages just before the oldest boundary with the same timestamp', () => {
  const previous = [message('a', 1), message('b', 1), message('c', 2)];
  assert.deepEqual(refreshMessages(previous, [message('b', 1), message('c', 2)]).map(m => m.id), ['a', 'b', 'c']);
});
