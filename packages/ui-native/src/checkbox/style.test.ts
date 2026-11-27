import { nativeTokens } from '@zigordev/tokens/native';
import { describe, expect, it } from 'vitest';
import { checkboxStyles } from './style.ts';

const tokens = nativeTokens.default.light;

describe('checkboxStyles', () => {
  it('fills a checked box with the accent, and leaves an empty one as a field', () => {
    const checked = checkboxStyles(tokens, { checked: true, disabled: false });
    const empty = checkboxStyles(tokens, { checked: false, disabled: false });

    expect(checked.box.backgroundColor).toBe(tokens['color-accent-solid']);
    expect(checked.mark.color).toBe(tokens['color-accent-on']);
    expect(empty.box.backgroundColor).toBe(tokens['color-bg-field']);
    expect(empty.box.borderColor).toBe(tokens['color-border-field']);
  });

  it('greys a disabled box and its label out', () => {
    const disabled = checkboxStyles(tokens, { checked: true, disabled: true });

    expect(disabled.box.backgroundColor).toBe(tokens['color-bg-disabled']);
    expect(disabled.mark.color).toBe(tokens['color-fg-disabled']);
    expect(disabled.label.color).toBe(tokens['color-fg-disabled']);
  });
});
