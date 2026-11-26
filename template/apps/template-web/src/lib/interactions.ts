export const interactions = ['note.created', 'note.deleted'] as const;

export type Interaction = (typeof interactions)[number];
