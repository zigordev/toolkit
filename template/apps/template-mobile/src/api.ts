import createQueryHooks from 'openapi-react-query';
import { createTemplateApiClient } from 'template-api-client';
import { apiUrl } from './config';

export const api = createQueryHooks(createTemplateApiClient({ baseUrl: apiUrl() }));
