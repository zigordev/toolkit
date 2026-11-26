import { headers } from 'next/headers';
import { createTemplateApiClient, type TemplateApiClient } from 'template-api-client';
import { getConfig } from './config.ts';

export async function notesApi(): Promise<TemplateApiClient> {
  const cookie = (await headers()).get('cookie');
  return createTemplateApiClient({
    baseUrl: getConfig().API_URL,
    ...(cookie === null ? {} : { headers: { cookie } }),
  });
}
