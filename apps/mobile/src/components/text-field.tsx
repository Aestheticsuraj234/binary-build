import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import type {TextInputProps} from 'react-native';
import {StyleSheet, Text, TextInput, View} from 'react-native';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Message shown under the input when its value is not valid. */
  error?: string;
}

/** A labelled text input with room for an error message underneath. */
export function TextField({label, error, ...inputProps}: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.accent}
        style={[styles.input, error ? styles.inputInvalid : undefined]}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {gap: spacing.sm},
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
  },
  inputInvalid: {borderColor: colors.danger},
  error: {color: colors.danger, fontSize: fontSize.sm},
});
