export class AppError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') { super(message); this.status = status; this.code = code; }
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.name === 'ZodError') return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input', code: 'INVALID_INPUT' });
  if (err.code === 'P2002') return res.status(409).json({ error: 'That username or email is already in use, or this action was already completed.', code: 'CONFLICT' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'This item is no longer available.', code: 'NOT_FOUND' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Choose a file smaller than 12 MB.', code: 'FILE_TOO_LARGE' });
  if (err.name === 'MulterError') return res.status(400).json({ error: 'Upload one image or audio file at a time.', code: 'INVALID_UPLOAD' });
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('Request failed:', err.name, err.code || '', err.message);
  res.status(status).json({ error: status < 500 ? err.message : 'Something went wrong. Please try again.', code: err.status ? err.code : 'SERVER_ERROR' });
}
