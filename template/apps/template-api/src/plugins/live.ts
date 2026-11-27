import { forbidden } from '@zigordev/api';
import { addLiveUpdates, type LiveUpdates, pgListener } from '@zigordev/live/server';
import type { Logger } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';
import { notesChannel } from '../features/notes/live.ts';

export interface LiveOptions {
  readonly url: string;
  readonly logger: Logger;
}

export function serveLive(app: FastifyInstance, options: LiveOptions): LiveUpdates {
  return addLiveUpdates(app, {
    listener: pgListener({ url: options.url, logger: options.logger }),
    channelsOf: (_principal, request) => {
      if (!request.user) {
        throw forbidden('Live updates are for a person who is signed in.');
      }
      return [notesChannel(request.user.id)];
    },
  });
}
