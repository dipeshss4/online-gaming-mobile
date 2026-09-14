# Online Gaming — Android and iOS

See [PARITY.md](./PARITY.md) for the current web-to-native audit and remaining work.

## Crash increment (2026-09-14)

ASCENT_CRASH now opens a native screen with two configurable stake panels, independent cash-out, recent flights and server status polling. Zero disables a panel. Launch request metadata persists separately from slots and deposits; interrupted launches reuse the exact request ID and stakes. Opening the screen restores a flying round from server history. Cash-out confirmations are server-authoritative; the displayed multiplier is the last confirmed sample, not a payout guarantee. Leaving the screen does not stop a flight. The screen uses an initial simplified flight visualization; the web's full sound and animation treatment remains on the parity checklist.

TypeScript and iOS/Android bundle exports passed. Mocked browser verification covers interrupted launch recovery and confirmed cash-out. No real wallet funds were used. Physical-device timing and lifecycle QA remain before release.

Independent Expo / React Native / TypeScript app. All mobile work lives here; backend and frontend are unchanged.

## Run

## Stripe test deposits

Wallet → Deposit reuses the existing web/backend hosted Stripe Checkout integration. Only `STRIPE` with `deposits=true` and `sandbox=true` is offered. The client checks method mode immediately before creating a session, rejects non-sandbox responses, and only opens standard HTTPS `checkout.stripe.com/c/pay/cs_test_…` URLs. Custom checkout domains are intentionally not supported in this test-only version. Backend authorization, mode enforcement and deployment configuration remain authoritative; these client checks are not a substitute for server controls.

Create test checkout, then tap Open Stripe test checkout. Complete it using Stripe test payment details, return to the app and Check payment status. The current server return URL still points to the web app; native deep-link return is not implemented. On a physical device a localhost web return URL will not reach your computer, but you can close the browser and return manually. Status refreshes on native foreground and every three seconds for up to two minutes while pending, with manual refresh available afterward. Only a server-confirmed payment updates the displayed wallet; redirects and browser dismissal never credit it.

Deposit request metadata is persisted separately from bets, with the same ID/amount reused after an uncertain network response. The amount stays locked until the deposit reaches a terminal state. Attempts that cannot be reconciled require backend investigation; do not delete saved request metadata to retry blindly. No keys, card collection, Stripe PaymentSheet SDK, Connect payouts or live-payment capability were added to mobile. Backend and web files are unchanged. The existing backend Stripe test credentials and payment configuration must already be enabled.

Verification: TypeScript, both native bundle exports, and mocked browser tests for session creation retry and confirmed settlement. No actual Stripe session or payment was submitted in these tests. Real sandbox checkout/webhook and physical-device testing are still required before considering the integration verified end-to-end. Test-mode integration does not establish eligibility for live gaming payments or app-store distribution.

Requires Node 22.13+ and npm. From this folder:

```sh
npm install
npm start
```

Open the project in an SDK-compatible Expo Go client, or press `i` for an installed iOS simulator / `a` for an Android emulator. Native development builds require Xcode or Android Studio respectively. This repository does not yet configure signing or store distribution.

For a physical phone on the same Wi-Fi, create `.env.local` using `.env.example` and set `EXPO_PUBLIC_API_URL` to your computer's LAN address, port 8080. Restart Expo after configuration changes. The backend must listen on the LAN interface and your firewall must permit your test phone. Default URLs are localhost:8080 on iOS simulator and 10.0.2.2:8080 on Android emulator. Never expose the development database.

```sh
npm run web -- --port 8081
npx tsc --noEmit
npx expo-doctor
npx expo export --platform ios --platform android
```

`npm start` and `npm run web` launch a loopback-only API bridge on 127.0.0.1:8082 alongside Expo on port 8081. Development web requests use this bridge to reach the local backend on port 8080, avoiding backend CORS changes. Only localhost:8081 and 127.0.0.1:8081 browser origins are allowed. Keep this preview on port 8081. The bridge is not for deployment or remote backend access. Native requests still use EXPO_PUBLIC_API_URL directly and do not use browser CORS. Web tokens are memory-only. Device tokens use SecureStore. Production HTTP is rejected; configure HTTPS before release. Use a trusted HTTPS development endpoint if native transport policy blocks LAN HTTP; do not weaken release transport security.

## Implemented milestone

- Registration/login using existing backend accounts; no embedded credentials.
- Device token persistence, server identity validation on startup/foreground, expired-session handling.
- Searchable server game catalog and native playable REEL_3 / GRID_3X3 slots; unsupported layouts still show details only.
- Available wallet balance, held amount, latest 20 ledger transactions.
- Latest 20 personal bets, no fabricated activity.
- Password change and confirmed all-device logout using existing APIs.
- Dark mobile layout, safe areas, bottom tabs, pull-to-refresh, loading/error states.

The backend remains the authority for RBAC, balances, registration policy and results. No admin permission editing, deposits, withdrawals, payment SDK, background tracking or demo balance mutations were added.

## Coordination with backend/web work

See [API-CONTRACT.md](./API-CONTRACT.md) before changing response shapes. Mobile is a separate client, not a WebView wrapper. There are no backend or web edits in this milestone. Please keep endpoint changes backward compatible or coordinate a mobile update.

## Next milestones

1. Test login and session revocation with a dedicated development player on physical Android/iOS devices; add authentication integration tests against a dedicated test backend.
2. Extract individual screens/navigation, add full history pagination, forgotten-password flow once its API is agreed, and server-driven branding.
3. Extend native gameplay to roulette, crash and other engine-specific layouts; physical-device QA for the slot renderer.
4. Add provider games/payment flows only after backend contracts and provider eligibility are established.
5. Device QA, accessibility, final app identity/icons, signing, privacy disclosures and distribution review. This is not a store-ready release.

## Verification notes

Initial TypeScript check, Expo Doctor (21/21), and Android/iOS JavaScript/Hermes bundle exports passed. Bundle export is not a signed APK/IPA build or physical-device test.

Browser smoke checks at 390×844 passed with mocked API responses for login, catalog/details, wallet, bet history, account and confirmed logout. These do not establish real-account backend integration or native SecureStore behavior. `mobile-account-preview.png` shows test fixture data, not a real wallet.

## Native slots

## Native roulette

Catalog games with `engine.layout=ROULETTE` now open the native single-zero wheel and betting table. Numbers 0–36 and the nine backend-supported outside selections can be combined. Repeated taps add chips to a selection; remove and clear controls edit the ticket before submission. Integer-cent ticket totals avoid floating-point accumulation. One request submits the total and all selections; the server settles it. The wheel animation targets the returned pocket, respects reduced motion, and never determines the result.

Pending ticket recovery persists and resends the exact request ID, stake and selections, including across app restarts. No new ticket is allowed while a pending request is unresolved. Existing backend validation-before-idempotency limitations still apply. Browser fixture tests passed for a combined number/color ticket and an interrupted-request retry preserving the entire payload; Android/iOS bundle exports and TypeScript passed. Real-device and real-account QA remain. Crash and fish/arcade native gameplay are not implemented yet.

### Web design alignment

Mobile now reuses copies of the web app's four artwork assets from `frontend/public/art`, its black/gold palette, server-managed `/api/site` branding and lobby copy, illustrated posters, search/category/favorite controls, and Home/Wallet/History bottom navigation. Account controls are reached from the header. Sign-in uses the same casino-host image and members' entrance styling. Native reels use the web sprite atlases and grid background, with a gold circular spin control. Backend/web source files were not changed.

This is native presentation alignment, not a WebView or complete web feature parity: the sound-led entry intro, provider/arcade screens, web cashier/payment flows, and admin screens are not ported. Favorites currently last for the lobby component's lifetime. Visual smoke tests use mocked account/game responses and the actual public site-branding API. Real-device visual QA remains outstanding.

Open a catalog tile marked “Play native slots”. Compatible three-reel and 3×3 games use the same React Native renderer, with staggered animated stops, reduced-motion support, stake validation/presets, server paytables, and return/net-result display. No autoplay or local outcome generation. Each spin posts to `/api/games/{code}/play` with `{requestId,stake}`.

The pending request is saved before dispatch (SecureStore on devices, localStorage for non-secret bet metadata in browser preview). An uncertain request blocks new bets and offers explicit recovery using the same request ID and stake. A pending bet for another game directs the player back to that game. Backend idempotency protects retries. Disabled games or changed limits may block recovery because backend validation precedes its idempotency lookup; these cases need backend/admin reconciliation. Do not clear browser storage or uninstall the app while a bet is unresolved.

Mocked native-screen browser checks passed for a win response and a dropped-response recovery reusing the same request ID. TypeScript and both native bundle exports passed after the change. No real wallet was debited during testing. Physical-device animation and real-account play still need QA. `native-slots-preview.png` contains fixture data.

`npm audit` reports 10 moderate transitive advisories through Expo's xcode/uuid build-tool chain. No high/critical findings in the initial audit. The proposed automatic fix downgrades Expo to an incompatible old major, so it was not applied. Track the upstream toolchain fix before release; no claim of a clean dependency audit is made.
