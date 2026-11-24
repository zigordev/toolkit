export type ComponentStatus = 'up' | 'down' | 'unknown';
export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface HealthComponent {
  readonly name: string;
  readonly required: boolean;
  readonly check: () => ComponentStatus | Promise<ComponentStatus>;
}

export interface HealthBody {
  readonly status: HealthStatus;
  readonly service: string;
  readonly version: string;
  readonly components: Readonly<Record<string, { readonly status: ComponentStatus }>>;
}

export interface HealthReport {
  readonly statusCode: 200 | 503;
  readonly body: HealthBody;
}

export interface CheckHealthOptions {
  readonly service: string;
  readonly components: readonly HealthComponent[];
  readonly timeoutMs?: number;
}

async function runCheck(component: HealthComponent, timeoutMs: number): Promise<ComponentStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<ComponentStatus>((resolve) => {
    timer = setTimeout(() => resolve('down'), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(component.check), timeout]);
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth(options: CheckHealthOptions): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? 800;
  const results = await Promise.all(
    options.components.map(async (component) => ({
      component,
      status: await runCheck(component, timeoutMs),
    }))
  );
  const components = Object.fromEntries(
    results.map(({ component, status }) => [component.name, { status }])
  );
  const requiredDown = results.some(
    ({ component, status }) => component.required && status === 'down'
  );
  const optionalDown = results.some(
    ({ component, status }) => !component.required && status === 'down'
  );
  const status: HealthStatus = requiredDown ? 'error' : optionalDown ? 'degraded' : 'ok';
  const version = process.env.OTEL_SERVICE_VERSION || 'unknown';
  return {
    statusCode: requiredDown ? 503 : 200,
    body: { status, service: options.service, version, components },
  };
}
