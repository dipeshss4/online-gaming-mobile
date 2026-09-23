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
  // One build per store: EXPO_PUBLIC_STORE_CODE ties the app to its store, and these give it its own name, icon
  // and store listing identity. See docs/MULTI_TENANCY.md.
  const store = (process.env.EXPO_PUBLIC_STORE_CODE || '').trim().toLowerCase();
  if (store && !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/.test(store)) throw new Error(`EXPO_PUBLIC_STORE_CODE "${store}" is not a store code.`);
  const identifier = (base: string) => store ? `${base}.${store.replace(/-/g, '')}` : base;
  const icon = process.env.STORE_APP_ICON;
  return {
    ...config,
    name: process.env.STORE_APP_NAME || config.name || 'Online Gaming',
    slug: config.slug || 'online-gaming-mobile',
    ...(icon ? { icon } : {}),
    ios: {
      ...config.ios,
      ...(store || process.env.STORE_IOS_BUNDLE_ID
        ? { bundleIdentifier: process.env.STORE_IOS_BUNDLE_ID || identifier(config.ios?.bundleIdentifier || 'com.onlinegaming.app') } : {}),
    },
    android: {
      ...config.android,
      package: process.env.STORE_ANDROID_PACKAGE || identifier(config.android?.package || 'com.onlinegaming.preview'),
      versionCode: 1,
      ...(icon ? { adaptiveIcon: { ...config.android?.adaptiveIcon, foregroundImage: icon } } : {}),
    },
  };
};
