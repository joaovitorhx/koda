import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Koda',
  slug: config.slug ?? 'koda',
  // Expo 57's development env module gives .env.local precedence over shell values.
  // Resolve the explicit demo command here, before handing public config to the client.
  extra: { ...config.extra, demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === 'true' },
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '' },
    ],
  ],
});
