import test from 'node:test';
import assert from 'node:assert/strict';
import { activePosts, feedCutoff, FEED_LIFETIME_MS } from '../src/feedRetention.js';
test('feed expires at exactly two hours, keeping younger posts', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const posts = [-1, 0, 1].map(offset => ({ id: offset, createdAt: new Date(now - FEED_LIFETIME_MS + offset).toISOString() }));
  assert.deepEqual(activePosts(posts, now).map(p => p.id), [1]);
  assert.equal(feedCutoff(now), '2026-10-01T10:00:00.000Z');
  assert.equal(posts.length, 3);
});
test('cached pagination and background-tab history expire on recheck', () => {
  const now = Date.now();
  const posts = [{ id: 1, createdAt: new Date(now).toISOString() }];
  assert.equal(activePosts(posts, now).length, 1);
  assert.deepEqual(activePosts(posts, now + FEED_LIFETIME_MS), []);
});
