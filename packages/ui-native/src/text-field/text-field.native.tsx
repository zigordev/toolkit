import { useState } from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';
import { useTokens } from '../theme.native.tsx';
import { fieldStyles } from './style.ts';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
}

export function TextField({
  label,
  description,
  error,
  editable = true,
  onFocus,
  onBlur,
  ...input
}: TextFieldProps) {
  const tokens = useTokens();
  const [focused, setFocused] = useState(false);
  const styles = fieldStyles(tokens, {
    focused,
    invalid: error !== undefined,
    disabled: !editable,
    multiline: input.multiline === true,
  });
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={styles.placeholder}
        editable={editable}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={styles.input}
      />
      {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
      {error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function TextArea(props: Omit<TextFieldProps, 'multiline'>) {
  return <TextField multiline numberOfLines={4} {...props} />;
}
