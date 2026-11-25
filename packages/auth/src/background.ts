export interface BackgroundTasks {
  run(task: Promise<unknown>): void;
  settle(): Promise<void>;
}

export function createBackgroundTasks(): BackgroundTasks {
  const pending = new Set<Promise<void>>();
  return {
    run(task) {
      const tracked: Promise<void> = task.then(
        () => undefined,
        () => undefined
      );
      pending.add(tracked);
      void tracked.finally(() => pending.delete(tracked));
    },
    async settle() {
      while (pending.size > 0) {
        await Promise.all(pending);
      }
    },
  };
}
