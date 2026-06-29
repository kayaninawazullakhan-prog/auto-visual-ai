/** Run `fn` over items with a bounded number of concurrent workers. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  const pool = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(pool);
  return results;
}
