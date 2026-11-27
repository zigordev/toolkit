import { nativeTokens } from '@zigordev/tokens/native';
import { describe, expect, it } from 'vitest';
import { type ButtonLook, buttonStyles } from './style.ts';

const light = nativeTokens.default.light;
const dark = nativeTokens.default.dark;
const base: ButtonLook = {
  variant: 'solid',
  tone: 'accent',
  size: 'md',
  iconOnly: false,
  disabled: false,
  pressed: false,
};

describe('buttonStyles', () => {
  it('fills a solid accent button, and darkens it while pressed', () => {
    const resting = buttonStyles(light, base);
    const pressed = buttonStyles(light, { ...base, pressed: true });

    expect(resting.container.backgroundColor).toBe(light['color-accent-solid']);
    expect(resting.label.color).toBe(light['color-accent-on']);
    expect(pressed.container.backgroundColor).toBe(light['color-accent-solid-hover']);
  });

  it('takes the size of the control and its padding from the tokens', () => {
    const large = buttonStyles(light, { ...base, size: 'lg' });

    expect(large.container.minHeight).toBe(light['size-control-lg']);
    expect(large.container.paddingHorizontal).toBe(light['space-control-lg']);
    expect(large.container.borderRadius).toBe(light['radius-button']);
    expect(large.label.fontWeight).toBe(light['font-weight-semibold']);
  });

  it('leaves no padding beside an icon on its own', () => {
    expect(buttonStyles(light, { ...base, iconOnly: true }).container.paddingHorizontal).toBe(0);
  });

  it('draws the soft, outline and ghost variants in the colours of their tone', () => {
    const soft = buttonStyles(light, { ...base, variant: 'soft', tone: 'danger' });
    const softPressed = buttonStyles(light, {
      ...base,
      variant: 'soft',
      tone: 'danger',
      pressed: true,
    });
    const outline = buttonStyles(light, { ...base, variant: 'outline', tone: 'danger' });
    const outlinePressed = buttonStyles(light, { ...base, variant: 'outline', pressed: true });
    const ghost = buttonStyles(light, { ...base, variant: 'ghost' });
    const ghostPressed = buttonStyles(light, { ...base, variant: 'ghost', pressed: true });

    expect(soft.container.backgroundColor).toBe(light['color-danger-soft']);
    expect(soft.label.color).toBe(light['color-danger-text']);
    expect(softPressed.container.backgroundColor).toBe(light['color-danger-soft-hover']);
    expect(outline.container.borderColor).toBe(light['color-danger-border-strong']);
    expect(outline.container.backgroundColor).toBe('transparent');
    expect(outlinePressed.container.backgroundColor).toBe(light['color-accent-soft']);
    expect(ghost.container.backgroundColor).toBe('transparent');
    expect(ghostPressed.container.backgroundColor).toBe(light['color-accent-soft']);
  });

  it('gives the neutral tone the page text and the field border', () => {
    const neutral = buttonStyles(light, { ...base, variant: 'outline', tone: 'neutral' });

    expect(neutral.label.color).toBe(light['color-fg-default']);
    expect(neutral.container.borderColor).toBe(light['color-border-field']);
    expect(buttonStyles(light, { ...base, tone: 'neutral' }).container.backgroundColor).toBe(
      light['color-neutral-solid']
    );
  });

  it('greys a disabled button out, and keeps a disabled ghost clear', () => {
    const disabled = buttonStyles(light, { ...base, disabled: true, pressed: true });
    const ghost = buttonStyles(light, { ...base, variant: 'ghost', disabled: true });

    expect(disabled.container.backgroundColor).toBe(light['color-bg-disabled']);
    expect(disabled.label.color).toBe(light['color-fg-disabled']);
    expect(disabled.container.borderColor).toBe('transparent');
    expect(ghost.container.backgroundColor).toBe('transparent');
  });

  it('takes the dark colours in dark mode', () => {
    expect(buttonStyles(dark, base).container.backgroundColor).toBe(dark['color-accent-solid']);
  });
});
