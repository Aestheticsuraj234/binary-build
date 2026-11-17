import {colors, fontSize, fontWeight, spacing} from '@binary/shared';
import {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '@/components/button';
import {Logo} from '@/components/logo';
import {authClient} from '@/lib/auth-client';

/** Home screen for a signed-in person. */
export default function HomeScreen() {
  const {data: session} = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    // Clears the session from secure storage. The root layout then shows
    // the sign-in screen.
    await authClient.signOut();
    setIsSigningOut(false);
  }

  const firstName = session?.user.name.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Logo />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Hi, {firstName}</Text>
        <Text style={styles.subtitle}>
          You&apos;re signed in as {session?.user.email}. Your AI coworkers will
          live here.
        </Text>
      </View>
      <Button
        label="Sign out"
        variant="secondary"
        onPress={handleSignOut}
        isLoading={isSigningOut}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  header: {paddingVertical: spacing.sm},
  body: {flex: 1, justifyContent: 'center'},
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
});
