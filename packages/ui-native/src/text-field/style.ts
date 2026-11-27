import type { NativeTokens } from '@zigordev/tokens/native';
import type { TextStyle, ViewStyle } from 'react-native';
import { lineHeight } from '../theme.ts';

export interface FieldLook {
  readonly focused: boolean;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly multiline: boolean;
}

export interface FieldStyles {
  readonly field: ViewStyle;
  readonly label: TextStyle;
  readonly input: TextStyle;
  readonly description: TextStyle;
  readonly error: TextStyle;
  readonly placeholder: string;
}

function borderOf(tokens: NativeTokens, look: FieldLook): string {
  if (look.invalid) {
    return tokens['color-danger-border-strong'];
  }
  return look.focused ? tokens['color-focus-ring'] : tokens['color-border-field'];
}

export function fieldStyles(tokens: NativeTokens, look: FieldLook): FieldStyles {
  const small = tokens['font-size-sm'];
  const fieldSize = tokens['font-size-field'];
  const line = lineHeight(fieldSize, tokens['font-line-height-normal']);
  return {
    field: { gap: tokens['space-2'] },
    label: {
      color: tokens['color-fg-default'],
      fontSize: small,
      fontWeight: tokens['font-weight-medium'],
      lineHeight: lineHeight(small, tokens['font-line-height-normal']),
    },
    input: {
      minHeight: look.multiline ? line * 4 + tokens['space-2'] * 2 : tokens['size-control-md'],
      paddingHorizontal: tokens['space-3'],
      paddingVertical: look.multiline ? tokens['space-2'] : 0,
      borderWidth:
        look.focused || look.invalid ? tokens['focus-width'] : tokens['border-width-hairline'],
      borderColor: borderOf(tokens, look),
      borderRadius: tokens['radius-field'],
      backgroundColor: look.disabled ? tokens['color-bg-disabled'] : tokens['color-bg-field'],
      color: look.disabled ? tokens['color-fg-disabled'] : tokens['color-fg-default'],
      fontSize: fieldSize,
      lineHeight: line,
      textAlignVertical: look.multiline ? 'top' : 'center',
    },
    description: {
      color: tokens['color-fg-muted'],
      fontSize: small,
      lineHeight: lineHeight(small, tokens['font-line-height-normal']),
    },
    error: {
      color: tokens['color-danger-text'],
      fontSize: small,
      lineHeight: lineHeight(small, tokens['font-line-height-normal']),
    },
    placeholder: tokens['color-fg-muted'],
  };
}
