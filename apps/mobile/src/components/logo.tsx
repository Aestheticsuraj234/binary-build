import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {StyleSheet, Text, View} from 'react-native';

/** The Binary wordmark: a lime square and the product name. */
export function Logo() {
  return (
    <View style={styles.row}>
      <View style={styles.mark} />
      <Text style={styles.name}>Binary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  mark: {
    width: 12,
    height: 12,
    borderRadius: radius.sm / 2,
    backgroundColor: colors.accent,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
