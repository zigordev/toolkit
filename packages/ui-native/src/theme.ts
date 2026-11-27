import type { Mode } from '@zigordev/tokens';

export type ThemeMode = Mode | 'system';

export function resolveMode(mode: ThemeMode, scheme: string | null | undefined): Mode {
  if (mode !== 'system') {
    return mode;
  }
  return scheme === 'light' ? 'light' : 'dark';
}

export function lineHeight(fontSize: number, ratio: number): number {
  return Math.round(fontSize * ratio);
}
