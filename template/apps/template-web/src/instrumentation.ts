export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { logProcessCrashes, logStarted } = await import('@zigordev/otel');
  const { getLogger } = await import('./lib/logger.ts');
  const logger = getLogger();
  logProcessCrashes(logger);
  logStarted(logger);
}
