import { type ApiPlugin, problemResponses, requireScope } from '@zigordev/api';
import type { FastifyRequest } from 'fastify';
import * as z from 'zod';
import { type Database, notesRepository, type Reach } from './repository.ts';
import {
  createNoteBody,
  listNotesQuery,
  noteParams,
  noteSchema,
  notesPage,
  updateNoteBody,
} from './schemas.ts';
import { notesService } from './service.ts';

export interface NotesOptions {
  readonly db: Database;
}

const reachDescription =
  'A person who is signed in reaches only the notes they wrote: any other note answers 404. A caller with an API key needs the scope, and reaches every note.';

function reachOf(request: FastifyRequest, scope: 'notes:read' | 'notes:write'): Reach {
  if (request.user) {
    return { ownerId: request.user.id };
  }
  requireScope(request, scope);
  return 'all';
}

export const notes: ApiPlugin<NotesOptions> = async (app, options) => {
  const service = notesService(notesRepository(options.db));
  const tags = ['notes'];

  app.get(
    '',
    {
      schema: {
        summary: 'List the notes',
        description: reachDescription,
        tags,
        operationId: 'listNotes',
        querystring: listNotesQuery,
        response: { 200: notesPage, ...problemResponses(400, 401, 403) },
      },
    },
    async (request) => {
      return service.list(request.query, reachOf(request, 'notes:read'));
    }
  );

  app.post(
    '',
    {
      schema: {
        summary: 'Create a note',
        description:
          'A note made by a person who is signed in is theirs. A note made with an API key belongs to nobody, and only API keys reach it.',
        tags,
        operationId: 'createNote',
        body: createNoteBody,
        response: { 201: noteSchema, ...problemResponses(400, 401, 403) },
      },
    },
    async (request, reply) => {
      const note = await service.create(request.body, reachOf(request, 'notes:write'));
      request.log.info({ event: 'note.created', noteId: note.id });
      return reply.code(201).header('location', `/api/v1/notes/${note.id}`).send(note);
    }
  );

  app.get(
    '/:noteId',
    {
      schema: {
        summary: 'Get one note',
        description: reachDescription,
        tags,
        operationId: 'getNote',
        params: noteParams,
        response: { 200: noteSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) => {
      return service.get(request.params.noteId, reachOf(request, 'notes:read'));
    }
  );

  app.patch(
    '/:noteId',
    {
      schema: {
        summary: 'Change a note',
        description: reachDescription,
        tags,
        operationId: 'updateNote',
        params: noteParams,
        body: updateNoteBody,
        response: { 200: noteSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) => {
      return service.update(request.params.noteId, request.body, reachOf(request, 'notes:write'));
    }
  );

  app.delete(
    '/:noteId',
    {
      schema: {
        summary: 'Delete a note',
        description: reachDescription,
        tags,
        operationId: 'deleteNote',
        params: noteParams,
        response: {
          204: z.null().describe('The note is deleted.'),
          ...problemResponses(400, 401, 403, 404),
        },
      },
    },
    async (request, reply) => {
      await service.remove(request.params.noteId, reachOf(request, 'notes:write'));
      request.log.info({ event: 'note.deleted', noteId: request.params.noteId });
      return reply.code(204).send(null);
    }
  );
};
