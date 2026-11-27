import type { NativeTokens } from '@zigordev/tokens/native';
import type { TextStyle, ViewStyle } from 'react-native';
import { lineHeight } from '../theme.ts';

export interface CheckboxLook {
  readonly checked: boolean;
  readonly disabled: boolean;
}

export interface CheckboxStyles {
  readonly row: ViewStyle;
  readonly box: ViewStyle;
  readonly mark: TextStyle;
  readonly texts: ViewStyle;
  readonly label: TextStyle;
  readonly description: TextStyle;
}

export function checkboxStyles(tokens: NativeTokens, look: CheckboxLook): CheckboxStyles {
  const size = tokens['size-icon-md'];
  const text = tokens['font-size-md'];
  const small = tokens['font-size-sm'];
  const filled = look.disabled ? tokens['color-bg-disabled'] : tokens['color-accent-solid'];
  return {
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens['space-3'] },
    box: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: tokens['border-width-hairline'],
      borderColor: look.checked ? filled : tokens['color-border-field'],
      borderRadius: tokens['radius-sm'],
      backgroundColor: look.checked ? filled : tokens['color-bg-field'],
    },
    mark: {
      color: look.disabled ? tokens['color-fg-disabled'] : tokens['color-accent-on'],
      fontSize: small,
      fontWeight: tokens['font-weight-bold'],
      lineHeight: size,
    },
    texts: { flexShrink: 1, gap: tokens['space-1'] },
    label: {
      color: look.disabled ? tokens['color-fg-disabled'] : tokens['color-fg-default'],
      fontSize: text,
      lineHeight: lineHeight(text, tokens['font-line-height-normal']),
    },
    description: {
      color: tokens['color-fg-muted'],
      fontSize: small,
      lineHeight: lineHeight(small, tokens['font-line-height-normal']),
    },
  };
}
