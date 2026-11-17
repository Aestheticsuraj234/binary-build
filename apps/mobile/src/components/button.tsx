import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * `primary` is the lime main action: use it once per screen.
   * `danger` is for things that can't be undone, like firing an agent.
   */
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  disabled?: boolean;
}

/** A full-width button that shows a spinner while busy. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: isDisabled, busy: isLoading}}
      disabled={isDisabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        styles[variant],
        pressed && (isPrimary ? styles.primaryPressed : styles.otherPressed),
        isDisabled && styles.disabled,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary && styles.primaryLabel,
            variant === 'danger' && styles.dangerLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {backgroundColor: colors.accent},
  primaryPressed: {backgroundColor: colors.accentPressed},
  secondary: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  danger: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
  },
  otherPressed: {backgroundColor: colors.surfaceRaised},
  disabled: {opacity: 0.5},
  label: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  primaryLabel: {color: colors.onAccent},
  dangerLabel: {color: colors.danger},
});
