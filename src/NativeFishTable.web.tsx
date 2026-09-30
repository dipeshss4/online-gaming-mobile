import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { FishProps } from './fish/FishStage';

/** The web preview's fish table: Skia's browser engine (CanvasKit) is fetched before anything drawing with Skia loads. */
const Loading = () => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#041630' }}><ActivityIndicator color="#ffd54a" /></View>;
const CANVASKIT = 'https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/';

export const supportsFishTable = (game: { engine?: { layout: string } }) => game.engine?.layout === 'FISH';

export function NativeFishTable(props: FishProps) {
  return <WithSkiaWeb getComponent={() => import('./fish/FishStage')} componentProps={props} fallback={<Loading />} opts={{ locateFile: file => CANVASKIT + file }} />;
}
