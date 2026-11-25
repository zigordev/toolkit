import { randomUUID } from 'node:crypto';
import * as z from 'zod';

export interface EventDefinition<
  Type extends string = string,
  Schema extends z.ZodType = z.ZodType,
> {
  readonly type: Type;
  readonly version: number;
  readonly schema: Schema;
}

export interface Envelope<Type extends string = string, Data = unknown> {
  readonly id: string;
  readonly type: Type;
  readonly version: number;
  readonly occurredAt: string;
  readonly data: Data;
}

export type EventOf<Definition extends EventDefinition> =
  Definition extends EventDefinition<infer Type, infer Schema>
    ? Envelope<Type, z.output<Schema>>
    : never;

export type EventsOf<Definitions extends readonly EventDefinition[]> = EventOf<Definitions[number]>;

export type DataOf<Definition extends EventDefinition> = z.input<Definition['schema']>;

const typePattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/;

export function defineEvent<const Type extends string, Schema extends z.ZodType>(definition: {
  readonly type: Type;
  readonly version: number;
  readonly schema: Schema;
}): EventDefinition<Type, Schema> {
  if (!typePattern.test(definition.type)) {
    throw new Error(
      `An event type is lower case words joined by dots, such as note.created, not ${definition.type}`
    );
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`The version of ${definition.type} is a whole number from 1`);
  }
  return Object.freeze({ ...definition });
}

const envelopeSchema = z.object({
  id: z.uuid(),
  type: z.string().regex(typePattern),
  version: z.number().int().positive(),
  occurredAt: z.iso.datetime({ offset: true }),
  data: z.unknown(),
});

export function createEnvelope<Definition extends EventDefinition>(
  definition: Definition,
  data: DataOf<Definition>,
  options: { readonly id?: string; readonly now?: Date } = {}
): EventOf<Definition> {
  return {
    id: options.id ?? randomUUID(),
    type: definition.type,
    version: definition.version,
    occurredAt: (options.now ?? new Date()).toISOString(),
    data: definition.schema.parse(data),
  } as EventOf<Definition>;
}

export type Rejection = 'not_json' | 'not_an_event' | 'unknown_type' | 'invalid_data';

export type Reading<Definitions extends readonly EventDefinition[]> =
  | { readonly ok: true; readonly event: EventsOf<Definitions> }
  | {
      readonly ok: false;
      readonly reason: Rejection;
      readonly id?: string;
      readonly type?: string;
    };

export function readEnvelope<const Definitions extends readonly EventDefinition[]>(
  definitions: Definitions,
  value: Buffer | string | null | undefined
): Reading<Definitions> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof value === 'string' ? value : (value?.toString('utf8') ?? ''));
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return { ok: false, reason: 'not_an_event' };
  }
  const { id, type, version } = envelope.data;
  const definition = definitions.find(
    (candidate) => candidate.type === type && candidate.version === version
  );
  if (definition === undefined) {
    return { ok: false, reason: 'unknown_type', id, type };
  }
  const data = definition.schema.safeParse(envelope.data.data);
  if (!data.success) {
    return { ok: false, reason: 'invalid_data', id, type };
  }
  return {
    ok: true,
    event: { ...envelope.data, data: data.data } as EventsOf<Definitions>,
  };
}
