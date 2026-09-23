# Online Gaming — Android and iOS

## Shared AWS demo endpoint

Native builds default to `https://loot777x.com`; the EAS preview profile explicitly selects it. `npm run web` uses the loopback bridge on 8082 to reach this same HTTPS origin without changing server CORS. Restart the preview after changing the bridge configuration. Existing APKs require rebuilding/reinstalling to change the bundled endpoint. Sessions are namespaced by backend to prevent reuse of local-server credentials.

The currently deployed AWS backend returns 401 for public `/api/site`. The mobile app displays a compatibility message until the newer backend is deployed; configuring the URL alone does not make login/games compatible. No fabricated site configuration or authentication bypass is provided.

For local development, set `EXPO_PUBLIC_API_URL` and `MOBILE_API_UPSTREAM` to the same local backend origin when launching. The bridge stays loopback-only, permits only its two localhost browser origins, and forwards only `/api/` GET/POST requests. Native devices connect directly to the configured backend. AWS still uses HTTP between its edge and the origin; this is a temporary demo, not end-to-end TLS.

## One app per store

The server runs one site per store (`abc.loot777x.com`), and a phone app has no subdomain, so each store that
wants its own app gets its own build. `EXPO_PUBLIC_STORE_CODE` ties a build to its store, and the app sends it as
`X-Store-Code` on every request. The server treats that exactly like the store's own site:
- signups join that store
- only that store's players (and staff) can sign in
- the app shows the store's name and branding

A build without a store code is the **platform's app**. It talks to `loot777x.com`, so signups become the
platform's own players, and players of other stores are asked to use their store's app or site.

**Building a store's APK:** in GitHub → Actions → *Mobile checks and APK* → *Run workflow* on `native-app`, enter
the store code (e.g. `abc`) and optionally an app name (e.g. `ABC Games`). The APK appears as that run's
`online-gaming-abc-apk` artifact.

Locally, run `EXPO_PUBLIC_STORE_CODE=abc STORE_APP_NAME="ABC Games" eas build --profile preview --platform android`.
`STORE_APP_ICON` sets the store's own icon.

**Each store's app is a separate app on the phone.** Its Android package is `com.onlinegaming.preview.<code>`
(override with `STORE_ANDROID_PACKAGE`), so it installs next to the platform app and the other stores' apps.
EAS needs a signing key for each new package. Create it once per store with `eas credentials` (Android →
preview), because the workflow builds non-interactively and cannot create one itself.

The store must exist and be active on the server, and store sites must be switched on there
(`TENANCY_BASE_DOMAIN`). Otherwise the app shows "This app's store is not open".

## Landscape layout

The first APK-inspired revamp adds a horizontal game shelf, compact category/search controls, session favorites and wider game stages. It reuses this project's artwork and existing server-backed games; no Unity binaries or original JUWA game logic were imported. Browser smoke checks use mocked accounts/catalogs, not real wallet transactions. Reconstructing the old game's mechanics remains separate work requiring gameplay references and agreed rules.

Native builds are configured for landscape orientation, including game modals. Sign-in uses artwork beside a scrollable form; the lobby has a left navigation rail and four-column game cards. Wallet balance and funding controls appear side by side. Slots, roulette and crash use independently scrollable game and betting panes. Portrait browser previews retain a stacked fallback.

Restart Expo after configuration changes. Rebuild and reinstall the native app to apply the orientation lock; refreshing a browser or an existing APK does not apply native orientation configuration. Browser checks at 844×390 use mocked account/game data. Physical Android/iOS rotation, keyboard and notch testing remain required. This change does not deploy AWS or generate an APK.

## How the app is meant to feel

`src/theme.ts` holds the tokens — one gold, one ground, one card, a four-step spacing rhythm. Before it there
were 131 distinct colour literals across the screens, a dozen near-identical golds among them, which is what
made the app look assembled rather than designed. New work uses the tokens; older screens move over as they are
touched.

`src/Tap.tsx` is the only thing that should be pressed. Every control dips and dims under the finger, ripples on
Android where that is the platform's answer, and gives a short haptic through `feel()` — selection for switching
between things, a heavier one for committing a stake, success for a win, warning for a refusal. Feedback used to
be whatever each screen remembered to add: a couple of game tiles scaled, most buttons did nothing, nothing
buzzed. Haptics are loaded lazily and wrapped, so a build without the native module degrades to silence instead
of a crash, and the web preview simply has nothing to buzz.

`src/Skeleton.tsx` replaces spinners and blank space: the lobby, the live floor and the first launch show the
shape of what is coming. All animation respects the system's reduce-motion setting.

The home screen shows the floor's totals in one line above the games and the boards below them. A scoreboard
that pushes the games off the first screen has the app's priorities backwards.

`src/WinCelebration.tsx` is what a win looks like, in all three games. The paying row swells twice under a gold
wash — a beat later on each reel, so the eye is led along the payline — while a banner springs in above it with
the amount counting up to what the server actually paid. The celebration is sized to the win: under 2× it is a
short banner, from 2× it adds sparks, from 10× it is louder and holds longer. Treating a 1.5× return like a
jackpot is how a game teaches players to ignore it. The banner sits above the paying row rather than across it,
clears itself, and never blocks a tap. Under reduce-motion the win is still announced; it simply does not move.

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

## Running on a simulator and an emulator

Both open the same Metro instance. Give the app an address the devices can reach: the Mac's LAN IP, not
`localhost`, because the Android emulator's `localhost` is the emulator itself.

```bash
IP=$(ipconfig getifaddr en0)                       # the Mac on your network
EXPO_PUBLIC_API_URL=http://$IP:8080 npx expo start --port 8091 --ios
```

`--ios` opens the booted simulator and installs the matching Expo Go if its version is behind. Metro's default
port is 8081, which is also the API's metrics port, so pass `--port 8091`.

For Android, with an emulator already running (`emulator -avd <name>` from `$ANDROID_HOME/emulator`):

```bash
adb install -r Expo-Go-57.0.9.apk                   # once; the URL is in api.expo.dev/v2/versions/latest
adb shell am start -a android.intent.action.VIEW -d "exp://$IP:8091" host.exp.exponent
```

Both devices show the **landscape** layout, because `app.json` sets `"orientation": "landscape"` for native
builds. A simulator left in portrait therefore shows the landscape layout rotated inside a portrait window;
rotate the simulator (⌘→) to see it as a player would.

Screenshots for a report: `xcrun simctl io booted screenshot ios.png` and `adb exec-out screencap -p > and.png`.

## The floor

The lobby opens with what everyone has been playing — rounds, total staked, players, and the day's best return —
then today's biggest wins and the newest rounds, from `GET /api/live`. It is the same data the web lobby shows,
under the same rules: players are named only where they opted in, and rounds from QA-forced outcomes or flagged
test accounts never appear.

The web receives these on its event stream. This app **asks every six seconds instead**: React Native has no
`EventSource`, and streamed `fetch` is unreliable across both platforms, so a small poll is the honest option.
It stops while the app is in the background and catches up when it returns.

## Play limits and breaks

The Wallet tab carries the same responsible-gambling controls as the web cashier, against the same API
(`GET /api/protection`, `PUT /api/protection/limits/{kind}`, `POST /api/protection/break`):

- deposit and loss limits per 24 hours, 7 days and 30 days, showing what is used and what is left;
- a lower limit applies at once, while raising or removing one waits out the server's cooling period, which the
  screen states and then shows as a pending change with the time it takes effect;
- cooling-off (24 hours, 7 days, 30 days) and self-exclusion (6 months, 1 year, 5 years), both behind a
  confirmation step that says what cannot be undone.

The server owns every rule here; the screen only sends what the player asked for and shows what comes back.
Enforcement of an active break also lives in the backend, so it holds whatever the app does.

## Layout check (phones)

`scripts/check-ui.mjs` opens the web preview at 390×844, walks sign-in → lobby → a slot game → wallet → withdraw
→ limits → history → landscape, and fails if a screen scrolls sideways, if text is under 11px, or if a control is
under 40px tall. Sideways it also checks the game itself: the stage must be the larger half of the screen and the
reels a readable height, because the split was once decided by flex ratios that Android and the browser divided
differently — leaving the game the smaller side on a real phone. It also checks what the money screens send: a limit save and removal, a break asking first, and a
withdrawal requested, retried after a provider failure with the same requestId, then cancelled. The API is mocked,
so it needs no backend and no account:

```
npm start -- --web --port 8090      # one terminal
npx playwright install chromium     # once
node scripts/check-ui.mjs           # another terminal; writes ui-shots/
```

It is a layout check on React Native for Web, not a substitute for looking at a real device: it cannot see
native text scaling, safe-area insets on a notched phone, or touch behaviour.

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
