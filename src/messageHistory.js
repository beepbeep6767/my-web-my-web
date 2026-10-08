const compareMessages = (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export const sortMessages = rows => [...rows].sort(compareMessages);

// Preserve loaded history and realtime arrivals newer than the fetched page.
export function refreshMessages(previous, fetched) {
  if (!fetched.length) return [];
  const ids = new Set(fetched.map(message => message.id));
  const oldest = fetched[0];
  const newest = fetched.at(-1);
  const retained = previous.filter(message => !ids.has(message.id) && (compareMessages(message, oldest) < 0 || compareMessages(message, newest) > 0));
  return sortMessages([...retained, ...fetched]);
}
