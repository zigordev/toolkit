import * as z from 'zod';

export const livePath = '/api/v1/live';
export const liveChannel = 'zigordev_live';
export const changeEvent = 'change';
export const resyncEvent = 'resync';
export const maxChangesPerMessage = 50;

export const liveChange = z.strictObject({
  type: z
    .string()
    .max(100)
    .regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)*$/),
  id: z.string().min(1).max(200).optional(),
});

export type LiveChange = z.infer<typeof liveChange>;

export const liveNotice = liveChange.extend({
  channel: z.string().min(1).max(200),
});

export type LiveNotice = z.infer<typeof liveNotice>;

export const changeMessage = z.strictObject({
  channel: z.string().min(1).max(200),
  changes: z.array(liveChange).min(1).max(maxChangesPerMessage),
});

export type ChangeMessage = z.infer<typeof changeMessage>;

function parseWith<T>(schema: z.ZodType<T>, text: string): T | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseNotice(text: string): LiveNotice | undefined {
  return parseWith(liveNotice, text);
}

export function parseChangeMessage(text: string): ChangeMessage | undefined {
  return parseWith(changeMessage, text);
}
