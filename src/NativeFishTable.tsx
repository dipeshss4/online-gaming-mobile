import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { FishProps } from './fish/FishStage';

/**
 * Dragon Tide, the fish table, on phones: Skia is built into the app, so the stage loads straight away. The web
 * preview has its own version (NativeFishTable.web.tsx) that fetches Skia's browser engine first; keeping that out of
 * this file keeps the browser engine (and its Node-only imports) out of the Android and iOS bundles.
 */
const Loading = () => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#041630' }}><ActivityIndicator color="#ffd54a" /></View>;
const Stage = lazy(() => import('./fish/FishStage'));

export const supportsFishTable = (game: { engine?: { layout: string } }) => game.engine?.layout === 'FISH';

export function NativeFishTable(props: FishProps) {
  return <Suspense fallback={<Loading />}><Stage {...props} /></Suspense>;
}
