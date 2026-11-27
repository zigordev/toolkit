import { lineHeight, useTokens } from '@zigordev/ui-native';
import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';

export function Screen({ children }: { readonly children?: ReactNode }) {
  const tokens = useTokens();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens['color-bg-page'] }}
      contentContainerStyle={{ gap: tokens['space-4'], padding: tokens['space-6'] }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {children}
    </ScrollView>
  );
}

export function Body({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const tokens = useTokens();
  const size = tokens['font-size-lg'];
  return (
    <Text
      testID={testID}
      style={{
        color: tokens['color-fg-default'],
        fontSize: size,
        lineHeight: lineHeight(size, tokens['font-line-height-normal']),
      }}
    >
      {children}
    </Text>
  );
}
