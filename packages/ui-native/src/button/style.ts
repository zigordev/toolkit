import type { NativeTokens } from '@zigordev/tokens/native';
import type { TextStyle, ViewStyle } from 'react-native';
import { lineHeight } from '../theme.ts';

export type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost';
export type ButtonTone = 'accent' | 'neutral' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonLook {
  readonly variant: ButtonVariant;
  readonly tone: ButtonTone;
  readonly size: ButtonSize;
  readonly iconOnly: boolean;
  readonly disabled: boolean;
  readonly pressed: boolean;
}

export interface ButtonStyles {
  readonly container: ViewStyle;
  readonly label: TextStyle & { readonly color: string };
}

interface Palette {
  readonly solid: string;
  readonly solidPressed: string;
  readonly on: string;
  readonly soft: string;
  readonly softPressed: string;
  readonly text: string;
  readonly border: string;
}

function paletteOf(tokens: NativeTokens, tone: ButtonTone): Palette {
  if (tone === 'neutral') {
    return {
      solid: tokens['color-neutral-solid'],
      solidPressed: tokens['color-neutral-solid-hover'],
      on: tokens['color-neutral-on'],
      soft: tokens['color-neutral-soft'],
      softPressed: tokens['color-neutral-soft-hover'],
      text: tokens['color-fg-default'],
      border: tokens['color-border-field'],
    };
  }
  return {
    solid: tokens[`color-${tone}-solid`],
    solidPressed: tokens[`color-${tone}-solid-hover`],
    on: tokens[`color-${tone}-on`],
    soft: tokens[`color-${tone}-soft`],
    softPressed: tokens[`color-${tone}-soft-hover`],
    text: tokens[`color-${tone}-text`],
    border: tokens[`color-${tone}-border-strong`],
  };
}

function colours(look: ButtonLook, palette: Palette) {
  switch (look.variant) {
    case 'soft':
      return {
        background: look.pressed ? palette.softPressed : palette.soft,
        text: palette.text,
        border: 'transparent',
      };
    case 'outline':
      return {
        background: look.pressed ? palette.soft : 'transparent',
        text: palette.text,
        border: palette.border,
      };
    case 'ghost':
      return {
        background: look.pressed ? palette.soft : 'transparent',
        text: palette.text,
        border: 'transparent',
      };
    default:
      return {
        background: look.pressed ? palette.solidPressed : palette.solid,
        text: palette.on,
        border: 'transparent',
      };
  }
}

export function buttonStyles(tokens: NativeTokens, look: ButtonLook): ButtonStyles {
  const height = tokens[`size-control-${look.size}`];
  const chosen = colours(look, paletteOf(tokens, look.tone));
  const disabledBackground = look.variant === 'ghost' ? 'transparent' : tokens['color-bg-disabled'];
  const background = look.disabled ? disabledBackground : chosen.background;
  const text = look.disabled ? tokens['color-fg-disabled'] : chosen.text;
  const border = look.disabled ? 'transparent' : chosen.border;
  const fontSize = tokens['font-size-control'];
  return {
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens['space-control-gap'],
      minHeight: height,
      minWidth: height,
      paddingHorizontal: look.iconOnly ? 0 : tokens[`space-control-${look.size}`],
      borderWidth: tokens['border-width-hairline'],
      borderColor: border,
      borderRadius: tokens['radius-button'],
      backgroundColor: background,
    },
    label: {
      color: text,
      fontSize,
      fontWeight: tokens['font-weight-semibold'],
      lineHeight: lineHeight(fontSize, tokens['font-line-height-tight']),
    },
  };
}
