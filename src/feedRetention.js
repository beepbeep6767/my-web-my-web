export const FEED_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const feedCutoff = (now = Date.now()) => new Date(now - FEED_LIFETIME_MS).toISOString();
export const activePosts = (posts, now = Date.now()) => posts.filter(post => Date.parse(post.createdAt) > now - FEED_LIFETIME_MS);
