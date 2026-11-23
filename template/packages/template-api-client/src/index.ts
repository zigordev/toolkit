import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './generated/schema.ts';

export type { operations, paths } from './generated/schema.ts';

export interface ClientOptions {
  readonly baseUrl: string;
  readonly key?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export type TemplateApiClient = Client<paths>;

export function createTemplateApiClient(options: ClientOptions): TemplateApiClient {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.key === undefined ? {} : { authorization: `Bearer ${options.key}` },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}
