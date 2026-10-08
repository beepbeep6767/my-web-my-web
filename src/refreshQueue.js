// Collapse bursts while preserving one trailing refresh after in-flight requests.
export function refreshQueue(task, delay = 350) {
  let timer, running = false, pending = false, stopped = false;
  async function run() {
    timer = undefined;
    if (stopped) return;
    if (running) { pending = true; return; }
    running = true;
    try { await task(); }
    finally {
      running = false;
      if (pending && !stopped) { pending = false; schedule(); }
    }
  }
  function schedule() {
    if (!stopped && !timer) timer = setTimeout(run, delay);
  }
  schedule.stop = () => { stopped = true; clearTimeout(timer); };
  return schedule;
}
