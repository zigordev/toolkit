import { Pressable, Text, View } from 'react-native';
import { useTokens } from '../theme.native.tsx';
import { checkboxStyles } from './style.ts';

export interface CheckboxProps {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  testID,
}: CheckboxProps) {
  const styles = checkboxStyles(useTokens(), { checked, disabled });
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.row}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={styles.box}>{checked ? <Text style={styles.mark}>✓</Text> : null}</View>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
      </View>
    </Pressable>
  );
}
