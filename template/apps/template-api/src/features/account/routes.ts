import { type ApiPlugin, forbidden, problemResponses } from '@zigordev/api';
import * as z from 'zod';

export const meSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
});

export const account: ApiPlugin = async (app) => {
  app.get(
    '/me',
    {
      schema: {
        summary: 'Say who is signed in',
        tags: ['account'],
        operationId: 'getMe',
        response: { 200: meSchema, ...problemResponses(401, 403) },
      },
    },
    async (request) => {
      const user = request.user ?? null;
      if (user === null) {
        throw forbidden('This route answers a signed-in person, not an API key.');
      }
      return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified };
    }
  );
};
