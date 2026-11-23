import * as z from 'zod';
import { invalidFields } from './problems.ts';

export const defaultLimit = 20;
export const maxLimit = 100;

export type SortDirection = 'asc' | 'desc';

export interface Sort<F extends string = string> {
  readonly field: F;
  readonly direction: SortDirection;
}

export type SortValue<F extends string> = F | `-${F}`;

export type CursorValue = string | number | boolean | null;

export interface ListQueryOptions<Shape extends z.ZodRawShape, F extends string> {
  readonly filters: Shape;
  readonly sort: readonly [F, ...F[]];
  readonly defaultSort: SortValue<F>;
}

export function listQuery<Shape extends z.ZodRawShape, F extends string>(
  options: ListQueryOptions<Shape, F>
) {
  const values = options.sort.flatMap((field) => [field, `-${field}`]) as [
    SortValue<F>,
    ...SortValue<F>[],
  ];
  return z.strictObject({
    ...options.filters,
    sort: z.enum(values).default(options.defaultSort as never),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    cursor: z.string().min(1).max(512).optional(),
  });
}

export function parseSort<F extends string>(value: SortValue<F>): Sort<F> {
  return value.startsWith('-')
    ? { field: value.slice(1) as F, direction: 'desc' }
    : { field: value as F, direction: 'asc' };
}

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().optional(),
  });
}

export interface Page<T> {
  readonly items: T[];
  readonly nextCursor?: string;
}

interface CursorContent {
  readonly s: string;
  readonly v: CursorValue[];
}

export function encodeCursor(sort: string, values: readonly CursorValue[]): string {
  const content: CursorContent = { s: sort, v: [...values] };
  return Buffer.from(JSON.stringify(content)).toString('base64url');
}

function invalidCursor(): Error {
  return invalidFields([
    {
      in: 'querystring',
      pointer: '/cursor',
      code: 'invalid_cursor',
      detail: 'is not a cursor that this list gave out for this sort order',
    },
  ]);
}

function isCursorValue(value: unknown): value is CursorValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function decodeCursor(cursor: string, sort: string, length: number): CursorValue[] {
  let content: unknown;
  try {
    content = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (typeof content !== 'object' || content === null) {
    throw invalidCursor();
  }
  const sorted = Reflect.get(content, 's');
  const values: unknown = Reflect.get(content, 'v');
  if (
    sorted !== sort ||
    !Array.isArray(values) ||
    values.length !== length ||
    !values.every(isCursorValue)
  ) {
    throw invalidCursor();
  }
  return values;
}

export function pageOf<T>(
  rows: readonly T[],
  limit: number,
  sort: string,
  keyOf: (row: T) => readonly CursorValue[]
): Page<T> {
  if (rows.length <= limit) {
    return { items: [...rows] };
  }
  const items = rows.slice(0, limit);
  const last = items.at(-1) as T;
  return { items, nextCursor: encodeCursor(sort, keyOf(last)) };
}
