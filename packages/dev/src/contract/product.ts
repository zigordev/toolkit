export interface App {
  readonly service: string;
  readonly image: string;
  readonly port: string | undefined;
  readonly agent: string | undefined;
}

export interface Job {
  readonly service: string;
  readonly kind: string;
  readonly waitedForBy: readonly string[];
}

export interface Product {
  readonly name: string;
  readonly apps: readonly App[];
  readonly jobs: readonly Job[];
  readonly networks: readonly string[];
}

export interface AgentPlace {
  readonly image: string;
  readonly script: string;
  readonly target: string;
  readonly host: string;
  readonly port: string;
}

interface Service {
  readonly image?: string;
  readonly environment?: Readonly<Record<string, string | null>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly depends_on?: Readonly<Record<string, { readonly condition?: string }>>;
}

interface Model {
  readonly name?: string;
  readonly services?: Readonly<Record<string, Service>>;
  readonly networks?: Readonly<Record<string, unknown>>;
}

export const ownImages = 'ghcr.io/zigordev/';
export const jobLabel = 'com.zigordev.job';
export const agentService = 'contract-agent';

export function readProduct(config: string): Product {
  const model = JSON.parse(config) as Model;
  const services = Object.entries(model.services ?? {});
  const isJob = (service: Service): boolean => service.labels?.[jobLabel] !== undefined;
  const jobs = services
    .filter(([, service]) => isJob(service))
    .map(([name, service]) => ({
      service: name,
      kind: service.labels?.[jobLabel] ?? '',
      waitedForBy: services
        .filter(
          ([, other]) => other.depends_on?.[name]?.condition === 'service_completed_successfully'
        )
        .map(([other]) => other),
    }));
  const apps = services
    .filter(([, service]) => !isJob(service) && service.image?.startsWith(ownImages))
    .map(([name, service]) => ({
      service: name,
      image: service.image ?? '',
      port: service.environment?.PORT ?? undefined,
      agent: service.environment?.OTEL_EXPORTER_OTLP_ENDPOINT ?? undefined,
    }));
  return {
    name: model.name ?? '',
    apps,
    jobs,
    networks: Object.keys(model.networks ?? {}),
  };
}

export function agentAddress(product: Product): URL | undefined {
  const addresses = new Set(product.apps.map((app) => app.agent));
  const [only] = addresses;
  if (addresses.size !== 1 || only === undefined || !URL.canParse(only)) {
    return undefined;
  }
  return new URL(only);
}

export function overrideFor(product: Product, project: string, agent: AgentPlace): object {
  const networks = product.networks.length === 0 ? ['default'] : product.networks;
  return {
    networks: Object.fromEntries(
      product.networks.map((name) => [name, { external: false, name: `${project}-${name}` }])
    ),
    services: {
      ...Object.fromEntries(
        product.apps.map((app) => [
          app.service,
          {
            environment: {
              OTEL_METRIC_EXPORT_INTERVAL: '1000',
              OTEL_BSP_SCHEDULE_DELAY: '500',
            },
            labels: { 'traefik.enable': 'false' },
            depends_on: { [agentService]: { condition: 'service_started' } },
          },
        ])
      ),
      [agentService]: {
        image: agent.image,
        command: ['node', agent.target, 'serve', agent.port],
        user: '1000:1000',
        init: true,
        stop_grace_period: '1s',
        volumes: [{ type: 'bind', source: agent.script, target: agent.target, read_only: true }],
        networks: Object.fromEntries(networks.map((name) => [name, { aliases: [agent.host] }])),
      },
    },
  };
}
