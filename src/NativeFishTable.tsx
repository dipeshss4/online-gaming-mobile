import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { FishProps } from './fish/FishStage';

/**
 * Dragon Tide, the fish table. The stage is loaded on first use: on the web preview Skia's engine (CanvasKit) has to
 * be fetched before anything that draws with Skia is even imported; phones have it built in.
 */
const Loading = () => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#041630' }}><ActivityIndicator color="#ffd54a" /></View>;
const NativeStage = lazy(() => import('./fish/FishStage'));
const CANVASKIT = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/';

export const supportsFishTable = (game: { engine?: { layout: string } }) => game.engine?.layout === 'FISH';

export function NativeFishTable(props: FishProps) {
  if (Platform.OS === 'web') return <WithSkiaWeb getComponent={() => import('./fish/FishStage')} componentProps={props} fallback={<Loading />}
    opts={{ locateFile: file => CANVASKIT + file }} />;
  return <Suspense fallback={<Loading />}><NativeStage {...props} /></Suspense>;
}
