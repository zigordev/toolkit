import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTokens } from '../theme.native.tsx';
import { type AlertTone, alertStyles } from './style.ts';

export interface AlertProps {
  readonly children: ReactNode;
  readonly tone?: AlertTone;
  readonly title?: string;
  readonly testID?: string;
}

export function Alert({ children, tone = 'info', title, testID }: AlertProps) {
  const styles = alertStyles(useTokens(), tone);
  return (
    <View
      accessibilityRole="alert"
      style={styles.box}
      {...(testID === undefined ? {} : { testID })}
    >
      {title === undefined ? null : <Text style={styles.title}>{title}</Text>}
      {typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}
