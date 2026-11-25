import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {useRouter} from 'expo-router';
import {StyleSheet, Text, View} from 'react-native';

import {Button} from '@/components/button';
import {CharacterFace} from '@/components/character-face';

/** Pebble asks for an API key, because agents need one to think. */
export function NeedsKey({
  message,
  title = 'Add an API key first',
}: {
  message: string;
  title?: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <CharacterFace character="pebble" mood="thinking" size={72} />
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      <Button label="Add an API key" onPress={() => router.push('/keys')} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  text: {flex: 1, gap: spacing.xs},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  message: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
});
