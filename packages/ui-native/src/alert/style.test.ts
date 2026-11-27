import { nativeTokens } from '@zigordev/tokens/native';
import { describe, expect, it } from 'vitest';
import { alertStyles } from './style.ts';

const tokens = nativeTokens.default.light;

describe('alertStyles', () => {
  it.each(['info', 'success', 'warning', 'danger'] as const)(
    'draws the %s alert in its own soft colour, border and title',
    (tone) => {
      const styles = alertStyles(tokens, tone);

      expect(styles.box.backgroundColor).toBe(tokens[`color-${tone}-soft`]);
      expect(styles.box.borderColor).toBe(tokens[`color-${tone}-border`]);
      expect(styles.title.color).toBe(tokens[`color-${tone}-text`]);
      expect(styles.body.color).toBe(tokens['color-fg-default']);
    }
  );
});
