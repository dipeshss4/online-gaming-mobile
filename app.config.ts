import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.EAS_BUILD === 'true') {
    const raw = process.env.EXPO_PUBLIC_API_URL;
    if (!raw) throw new Error('Set EXPO_PUBLIC_API_URL in the EAS preview environment before building the APK.');
    const url = new URL(raw);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)) {
      throw new Error('The test APK requires a publicly reachable HTTPS API URL, not a local development address.');
    }
  }
  return {
    ...config,
    name: config.name || 'Online Gaming',
    slug: config.slug || 'online-gaming-mobile',
    android: { ...config.android, package: config.android?.package || 'com.onlinegaming.preview', versionCode: 1 },
  };
};
