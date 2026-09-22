# Standalone Android test APK

## GitHub Actions

Pushes and pull requests run TypeScript checks and native bundle exports. To create a signed APK, run **Mobile checks and APK** manually on `native-app`. It uses the repository's `EXPO_TOKEN` secret and the existing EAS preview profile/signing key. On success, download `online-gaming-demo-apk` from the workflow artifacts (retained 14 days). No token belongs in source control. The cloud build may continue if the Actions job times out; inspect EAS before rerunning to avoid duplicate builds.

## Current cloud build

Submitted to `@dipeshss19/online-gaming-mobile` on 2026-09-16 (Nepal time):
https://expo.dev/accounts/dipeshss19/projects/online-gaming-mobile/builds/af6be95b-c232-4e4a-810f-0f2f83bfb4c7

Build profile: `preview`; package: `com.onlinegaming.preview`; AWS URL: `https://d3m8fr7e7xbses.cloudfront.net`. EAS generated and stores the Android signing key. Last checked status: `IN_QUEUE`; no APK artifact available yet. Download/install only after the build finishes successfully. No phone testing has occurred.

The EAS `preview` profile produces an installable APK, not an AAB and not an Expo Go-only bundle. Initial Android package: `com.onlinegaming.preview`.

Prerequisites: sign in to Expo with `npx eas-cli login`, link the project to the intended Expo account, and configure `EXPO_PUBLIC_API_URL` in the EAS preview environment to the verified public HTTPS backend origin (without `/api`). Never put payment secrets or JWT secrets into mobile build variables. The build rejects missing/local/HTTP API URLs on EAS.

From this folder:

```sh
npx eas-cli build --platform android --profile preview
```

Signing setup and the first project linkage require the account owner's input. No build has been submitted yet. There is no generated APK at this stage. Local builds require an Android SDK and compatible JDK, neither of which was available in the standard paths during the initial check.

Before deployment, authenticate to the existing AWS account, identify the current server and domain, back up the database and existing release, validate migrations and tests, and deploy only to that existing environment. Do not run the root `deploy-aws.sh` for a routine update: it provisions new VPC, EC2, and RDS resources.

After deployment verify HTTPS, health, login, catalog, crash, roulette and payment-method responses. Keep Stripe in test mode. Then build the APK and test on cellular data: sign-in, wallet, game transactions/recovery, background/resume, and hosted test checkout. Native checkout currently returns to the web URL; manually return to the app to refresh its server-confirmed status.
