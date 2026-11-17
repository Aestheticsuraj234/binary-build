import {expoClient} from '@better-auth/expo/client';
import {createAuthClient} from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

// Written to apps/mobile/.env.local by `pnpm run setup`.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Run `pnpm run setup`.');
}

/**
 * Better Auth for the phone. The session cookie is kept in the device's
 * secure storage (Keychain on iOS, Keystore on Android), never in plain files.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({
      scheme: 'binary',
      storagePrefix: 'binary',
      storage: SecureStore,
    }),
  ],
});
