export async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, { credentials: 'include', ...options, headers: { ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, body: options.body && !isForm ? JSON.stringify(options.body) : options.body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/signup'].includes(path)) window.dispatchEvent(new Event('mnchat:unauthenticated'));
    throw new Error(data.error || 'Could not connect. Please try again.');
  }
  return data;
}
export async function uploadFile(file) {
  const body = new FormData(); body.append('file', file);
  return (await api('/media', { method: 'POST', body })).media;
}
export const mediaUrl = id => `/api/media/${id}`;
export const time = date => date ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(date)) : '';
export const dateTime = date => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function socketRequest(socket, event, data) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Reconnecting. Please try again in a moment.'));
    socket.timeout(10000).emit(event, data, (error, result) => {
      if (error) reject(new Error('No confirmation yet. Retry to check or send this message safely.'));
      else if (!result?.ok) reject(new Error(result?.error || 'Could not complete this action.'));
      else resolve(result.data);
    });
  });
}
