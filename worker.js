import { parentPort } from 'node:worker_threads';
import { inspectText } from './filter.js';
parentPort.on('message', ({ id, text }) => {
  try { parentPort.postMessage({ id, result: inspectText(text) }); }
  catch { parentPort.postMessage({ id, error: true }); }
});
