import { type Authenticate, addDatabase, addHealthComponent, createApi } from '@zigordev/api';
import { createAuth } from '@zigordev/auth';
import { authenticateWith, serveAuth } from '@zigordev/auth/fastify';
import { startEvents } from '@zigordev/events';
import { startFlags } from '@zigordev/flags';
import type { Logger } from '@zigordev/otel';
import { type Config, kafkaOf, signInOf } from './config.ts';
import { notes as notesTable } from './db/schema.ts';
import { account } from './features/account/routes.ts';
import { hello } from './features/hello/routes.ts';
import { notes } from './features/notes/routes.ts';
import { apiKeys } from './plugins/api-keys.ts';
import { type EmailTopics, emailOutcomes, emailTopicsOf } from './plugins/emails.ts';
import { serveLive } from './plugins/live.ts';
import { anyOf, sendAuthEmails } from './plugins/sign-in.ts';

export interface EmailsTuning {
  readonly topics?: EmailTopics;
  readonly relayInterval?: number;
}

export interface AppOptions {
  readonly config: Config;
  readonly logger: Logger;
  readonly emails?: EmailsTuning;
}

function productOf(service: string): { readonly name: string; readonly displayName: string } {
  const name = service.replace(/-api$/, '');
  return { name, displayName: `${name.charAt(0).toUpperCase()}${name.slice(1)}` };
}

export async function buildApp(options: AppOptions) {
  const { config, logger } = options;
  const service = config.OTEL_SERVICE_NAME;
  const signIn = signInOf(config);
  let sessions: Authenticate | undefined;
  const app = await createApi({
    service,
    logger,
    docs: {
      title: 'Template API',
      description: 'The API of the product template: a greeting, and notes kept in PostgreSQL',
      version: '1.0.0',
      tags: [
        { name: 'hello', description: 'A greeting, to see that the API answers' },
        { name: 'notes', description: 'Notes to list, read, write and delete' },
        { name: 'account', description: 'The person who is signed in' },
      ],
    },
    authenticate: anyOf(apiKeys(config.API_KEYS), (request) => sessions?.(request)),
  });
  const db = addDatabase(app, { url: config.DATABASE_URL, schema: { notes: notesTable } });
  const topics = options.emails?.topics ?? emailTopicsOf(service);
  if (signIn !== undefined) {
    const product = productOf(service);
    const auth = createAuth({
      appName: product.name,
      displayName: product.displayName,
      config: signIn.config,
      methods: signIn.methods,
      appSchemes: [product.name],
      db,
      logger,
      sendEmail: sendAuthEmails({
        db,
        app: service,
        topic: topics.requests,
        product: product.displayName,
        logger,
      }),
    });
    sessions = authenticateWith(auth);
    await serveAuth(app, auth);
    serveLive(app, { url: config.DATABASE_URL, logger });
  }
  const flags = await startFlags({ app: service, file: config.FLAGS_FILE });
  addHealthComponent(app, flags.health);
  app.addHook('onClose', () => flags.stop());
  const kafka = kafkaOf(config);
  if (kafka !== undefined) {
    const relayInterval = options.emails?.relayInterval;
    const events = startEvents({
      connection: kafka,
      db,
      logger,
      consumers: [emailOutcomes({ topics, logger })],
      ...(relayInterval === undefined ? {} : { relay: { interval: relayInterval } }),
    });
    addHealthComponent(app, events.health);
    addHealthComponent(app, events.topics);
    app.addHook('onClose', () => events.stop());
  }
  await app.register(hello, { prefix: '/api/v1', service, flags: flags.client });
  await app.register(notes, { prefix: '/api/v1/notes', db });
  await app.register(account, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
