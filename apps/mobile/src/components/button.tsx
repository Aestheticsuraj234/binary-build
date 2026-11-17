import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** `primary` is the lime main action. Use it once per screen. */
  variant?: 'primary' | 'secondary';
  isLoading?: boolean;
}

/** A full-width button that shows a spinner while busy. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  isLoading = false,
}: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: isLoading, busy: isLoading}}
      disabled={isLoading}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed &&
          (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        isLoading && styles.loading,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} />
      ) : (
        <Text style={[styles.label, isPrimary && styles.primaryLabel]}>
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
  secondaryPressed: {backgroundColor: colors.surfaceRaised},
  loading: {opacity: 0.8},
  label: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  primaryLabel: {color: colors.onAccent},
});
