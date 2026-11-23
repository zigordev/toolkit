import type { ComponentStatus, Logger } from '@zigordev/otel';

export interface Api {
  readonly url: string;
  readonly logger: Logger;
}

const patience = 2000;

export async function getGreeting(api: Api): Promise<string | undefined> {
  try {
    const response = await fetch(new URL('/api/v1/hello', api.url), {
      signal: AbortSignal.timeout(patience),
    });
    if (!response.ok) {
      api.logger.warn({ event: 'api.refused', status: response.status });
      return undefined;
    }
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch (error) {
    api.logger.warn({ event: 'api.unreachable', error });
    return undefined;
  }
}

export async function pingApi(url: string): Promise<ComponentStatus> {
  const response = await fetch(new URL('/health', url));
  await response.arrayBuffer();
  return response.ok ? 'up' : 'down';
}
