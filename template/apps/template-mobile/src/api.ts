import createQueryHooks from 'openapi-react-query';
import { createTemplateApiClient } from 'template-api-client';
import { apiUrl } from './config';
import { withTimeout } from './timeout';

export function createApi(fetcher = withTimeout()) {
  const client = createTemplateApiClient({ baseUrl: apiUrl(), fetch: fetcher });
  return { client, ...createQueryHooks(client) };
}

export type Api = ReturnType<typeof createApi>;
