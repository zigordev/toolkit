import createQueryHooks from 'openapi-react-query';
import { createTemplateApiClient } from 'template-api-client';
import { apiUrl } from './config';
import { withTimeout } from './timeout';

export function createApi(fetcher = withTimeout()) {
  return createQueryHooks(createTemplateApiClient({ baseUrl: apiUrl(), fetch: fetcher }));
}

export const api = createApi();
