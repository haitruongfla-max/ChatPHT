export type MediaQueueItem = {
  id: string;
  size: number;
};

export type MediaQueueProgress = {
  completed: number;
  total: number;
  percent: number;
};

/**
 * Runs large direct uploads with bounded concurrency. Each worker receives an
 * item-local progress callback; the aggregate callback is weighted by file size
 * so that a large video is reflected accurately in the total progress bar.
 */
export async function runMediaUploadQueue<T extends MediaQueueItem>(
  items: T[],
  worker: (item: T, onProgress: (percent: number) => void) => Promise<void>,
  onProgress: (progress: MediaQueueProgress) => void,
  concurrency = 3,
): Promise<void> {
  if (items.length === 0) return;
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const progressById = new Map(items.map((item) => [item.id, 0]));
  const totalSize = Math.max(1, items.reduce((sum, item) => sum + Math.max(1, item.size), 0));
  let completed = 0;
  let nextIndex = 0;

  const emitProgress = () => {
    const uploaded = items.reduce(
      (sum, item) => sum + Math.max(1, item.size) * ((progressById.get(item.id) ?? 0) / 100),
      0,
    );
    onProgress({
      completed,
      total: items.length,
      percent: Math.min(100, Math.round((uploaded / totalSize) * 100)),
    });
  };

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await worker(item, (percent) => {
        progressById.set(item.id, Math.min(100, Math.max(0, percent)));
        emitProgress();
      });
      progressById.set(item.id, 100);
      completed += 1;
      emitProgress();
    }
  };

  emitProgress();
  await Promise.all(Array.from({ length: safeConcurrency }, () => runWorker()));
}
