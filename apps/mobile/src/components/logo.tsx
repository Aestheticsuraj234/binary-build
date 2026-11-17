import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {StyleSheet, Text, View} from 'react-native';

/** The Binary wordmark: a lime "01" tile and the product name. */
export function Logo() {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Text style={styles.tileText}>01</Text>
      </View>
      <Text style={styles.name}>Binary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    color: colors.onAccent,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Menlo',
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
