import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, Text } from 'react-native';
import { useTokens } from '../theme.native.tsx';
import { type ButtonSize, type ButtonTone, type ButtonVariant, buttonStyles } from './style.ts';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style' | 'disabled'> {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly tone?: ButtonTone;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly iconOnly?: boolean;
  readonly startIcon?: ReactNode;
  readonly endIcon?: ReactNode;
}

export function Button({
  children,
  variant = 'solid',
  tone = 'accent',
  size = 'md',
  disabled = false,
  loading = false,
  iconOnly = false,
  startIcon,
  endIcon,
  ...pressable
}: ButtonProps) {
  const tokens = useTokens();
  const inactive = disabled || loading;
  const look = (pressed: boolean) =>
    buttonStyles(tokens, { variant, tone, size, iconOnly, disabled: inactive, pressed });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      {...pressable}
      style={({ pressed }) => look(pressed).container}
    >
      {({ pressed }) => {
        const { label } = look(pressed);
        return (
          <>
            {loading ? <ActivityIndicator color={label.color} size="small" /> : startIcon}
            {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
            {endIcon}
          </>
        );
      }}
    </Pressable>
  );
}
