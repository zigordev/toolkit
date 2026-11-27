import type { NativeTokens } from '@zigordev/tokens/native';
import type { TextStyle, ViewStyle } from 'react-native';
import { lineHeight } from '../theme.ts';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertStyles {
  readonly box: ViewStyle;
  readonly title: TextStyle;
  readonly body: TextStyle;
}

export function alertStyles(tokens: NativeTokens, tone: AlertTone): AlertStyles {
  const text = tokens['font-size-md'];
  return {
    box: {
      gap: tokens['space-1'],
      padding: tokens['space-4'],
      borderWidth: tokens['border-width-hairline'],
      borderColor: tokens[`color-${tone}-border`],
      borderRadius: tokens['radius-card'],
      backgroundColor: tokens[`color-${tone}-soft`],
    },
    title: {
      color: tokens[`color-${tone}-text`],
      fontSize: text,
      fontWeight: tokens['font-weight-semibold'],
      lineHeight: lineHeight(text, tokens['font-line-height-normal']),
    },
    body: {
      color: tokens['color-fg-default'],
      fontSize: text,
      lineHeight: lineHeight(text, tokens['font-line-height-normal']),
    },
  };
}
