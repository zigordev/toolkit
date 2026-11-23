export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { start } = await import('./lib/start.ts');
    start();
  }
}
