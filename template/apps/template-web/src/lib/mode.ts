export const modes = ['system', 'light', 'dark'] as const;

export type Mode = (typeof modes)[number];

export const modeCookie = 'template.mode';

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (modes as readonly string[]).includes(value);
}

export function modeFrom(value: string | undefined): Mode {
  return isMode(value) ? value : 'system';
}
