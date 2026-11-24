import {colors} from '@binary/shared';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {ActivityIndicator, StyleSheet, View} from 'react-native';

import {authClient} from '@/lib/auth-client';

/** Header settings for every screen below the home screen. */
const INNER_SCREEN = {
  headerShown: true,
  headerStyle: {backgroundColor: colors.background},
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;

/**
 * Root of the app. Reads the saved session, then shows either the signed-in
 * screens or the sign-in screens. When the session changes (sign in, sign
 * out), Expo Router moves to the right screen on its own.
 */
export default function RootLayout() {
  const {data: session, isPending} = authClient.useSession();
  const isSignedIn = Boolean(session);

  if (isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: colors.background},
        }}
      >
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="index" />
          {/* Inner screens get a dark header with a back button. */}
          <Stack.Screen
            name="keys"
            options={{...INNER_SCREEN, title: 'API keys'}}
          />
          <Stack.Screen
            name="apps"
            options={{...INNER_SCREEN, title: 'Apps & tools'}}
          />
          <Stack.Screen
            name="integrations"
            options={{...INNER_SCREEN, title: 'Integrations'}}
          />
          <Stack.Screen
            name="agents/new"
            options={{...INNER_SCREEN, title: 'Hire a character'}}
          />
          <Stack.Screen name="agents/[id]/index" options={INNER_SCREEN} />
          <Stack.Screen name="chats/[id]" options={INNER_SCREEN} />
          <Stack.Screen
            name="chats/index"
            options={{...INNER_SCREEN, title: 'Recent chats'}}
          />
          <Stack.Screen
            name="computers"
            options={{...INNER_SCREEN, title: 'Your computers'}}
          />
          <Stack.Screen
            name="today"
            options={{...INNER_SCREEN, title: 'Today'}}
          />
          <Stack.Screen
            name="routines/index"
            options={{...INNER_SCREEN, title: 'Routines'}}
          />
          <Stack.Screen
            name="routines/new"
            options={{...INNER_SCREEN, title: 'New routine'}}
          />
          <Stack.Screen name="routines/[id]" options={INNER_SCREEN} />
          <Stack.Screen
            name="agents/[id]/edit"
            options={{...INNER_SCREEN, title: 'Edit'}}
          />
        </Stack.Protected>
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
