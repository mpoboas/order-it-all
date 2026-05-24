/**
 * Per-key in-memory mutex for serializing async work that mutates shared state.
 *
 * Designed for read-modify-write operations on a single record (e.g. toggling a
 * participant inside the JSON `items` field of a split). Without this, two
 * concurrent requests both read the same starting state and the second writer
 * silently overwrites the first one's change.
 *
 * Each call queues `fn` behind any previously queued task for the same `key`.
 * Tasks for different keys remain fully parallel. Failures in one task do not
 * block subsequent tasks in the same queue.
 *
 * Scope: this mutex lives in module scope and only coordinates within a single
 * Node.js process. It is sufficient for a self-hosted Next.js server or a warm
 * serverless instance; it does NOT serialize across multiple instances.
 */

const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = locks.get(key);

  const task: Promise<T> = (async () => {
    if (previous) {
      try {
        await previous;
      } catch {
        // Upstream task failed; we still get our turn.
      }
    }
    return fn();
  })();

  locks.set(key, task);

  void task
    .catch(() => undefined)
    .finally(() => {
      // Only clear the entry if we are still the tail of the queue. If another
      // task chained after us, it owns the entry now.
      if (locks.get(key) === task) {
        locks.delete(key);
      }
    });

  return task;
}

/** Test helper: number of active queues (for diagnostics only). */
export function activeLockCount(): number {
  return locks.size;
}
