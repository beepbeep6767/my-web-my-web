import { readFileSync } from 'node:fs';
export const FILTER_VERSION = 1; // Increment whenever words or normalization change.
const words = JSON.parse(readFileSync(new URL('./words.json', import.meta.url), 'utf8'));
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = words.english.map(word => new RegExp(`(?:^|[^a-z0-9])${[...word].map(escape).join('[^a-z0-9]*')}(?:s|ing|er|ers|ed)?(?:$|[^a-z0-9])`, 'i'));
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
export function inspectText(value) {
  const normalized = String(value).normalize('NFKC').replace(/[\p{Cf}]/gu, '').toLowerCase();
  const latin = normalized.replace(/[013457@$]/g, c => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', '$': 's' }[c]));
  if (patterns.some(pattern => pattern.test(latin))) return { allowed: false, version: FILTER_VERSION };
  const segments = new Set([...segmenter.segment(normalized)].filter(v => v.isWordLike).map(v => v.segment));
  const compact = normalized.replace(/[\s._-]+/g, '');
  const blocked = words.thai.some(word => word === 'หี' ? segments.has(word) : compact.includes(word));
  return { allowed: !blocked, version: FILTER_VERSION };
}
