import { Worker } from 'node:worker_threads';
import { AppError } from '../errors.js';
let worker;
let sequence = 0;
const pending = new Map();
function unavailable() { return new AppError(503, 'Content checks are temporarily busy. Please try again.', 'MODERATION_UNAVAILABLE'); }
function start() {
  if (worker) return worker;
  const instance = new Worker(new URL('./worker.js', import.meta.url));
  worker = instance;
  instance.on('message', ({ id, result, error }) => {
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(id);
    if (error) request.reject(unavailable()); else request.resolve(result);
  });
  const fail = () => {
    if (worker !== instance) return;
    worker = undefined;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(unavailable()); }
    pending.clear();
  };
  instance.on('error', fail); instance.on('exit', fail);
  return instance;
}
export async function assertAllowed(text) {
  if (!text) return;
  if (pending.size >= 256) throw unavailable();
  const instance = start();
  const id = ++sequence;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(unavailable()); }, 3000);
    pending.set(id, { resolve, reject, timer });
    instance.postMessage({ id, text });
  });
  if (!result.allowed) throw new AppError(422, 'This contains language that violates our community guidelines. Please edit it and try again.', 'CONTENT_BLOCKED');
}
export async function stopModeration() {
  const instance = worker;
  if (instance) await instance.terminate();
}
