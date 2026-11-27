import { nativeTokens } from '@zigordev/tokens/native';
import { describe, expect, it } from 'vitest';
import { type FieldLook, fieldStyles } from './style.ts';

const tokens = nativeTokens.default.light;
const base: FieldLook = { focused: false, invalid: false, disabled: false, multiline: false };

describe('fieldStyles', () => {
  it('draws a resting field with the field border and background', () => {
    const styles = fieldStyles(tokens, base);

    expect(styles.input.borderColor).toBe(tokens['color-border-field']);
    expect(styles.input.borderWidth).toBe(tokens['border-width-hairline']);
    expect(styles.input.backgroundColor).toBe(tokens['color-bg-field']);
    expect(styles.input.minHeight).toBe(tokens['size-control-md']);
    expect(styles.placeholder).toBe(tokens['color-fg-muted']);
  });

  it('rings a focused field, and marks an invalid one in danger', () => {
    expect(fieldStyles(tokens, { ...base, focused: true }).input.borderColor).toBe(
      tokens['color-focus-ring']
    );
    const invalid = fieldStyles(tokens, { ...base, focused: true, invalid: true });
    expect(invalid.input.borderColor).toBe(tokens['color-danger-border-strong']);
    expect(invalid.input.borderWidth).toBe(tokens['focus-width']);
    expect(invalid.error.color).toBe(tokens['color-danger-text']);
  });

  it('greys a disabled field out', () => {
    const disabled = fieldStyles(tokens, { ...base, disabled: true });

    expect(disabled.input.backgroundColor).toBe(tokens['color-bg-disabled']);
    expect(disabled.input.color).toBe(tokens['color-fg-disabled']);
  });

  it('gives a text area room for four lines, from the top', () => {
    const area = fieldStyles(tokens, { ...base, multiline: true });

    expect(area.input.textAlignVertical).toBe('top');
    expect(Number(area.input.minHeight)).toBeGreaterThan(tokens['size-control-md']);
  });
});
