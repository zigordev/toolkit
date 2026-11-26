'use client';

import createQueryHooks from 'openapi-react-query';
import { createTemplateApiClient } from 'template-api-client';

export const notesClient = createQueryHooks(createTemplateApiClient({ baseUrl: '' }));
