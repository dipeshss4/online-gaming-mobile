# Standalone Android test APK

## GitHub Actions

Pushes and pull requests run TypeScript checks and Android/iOS bundle exports. After checks pass, pushes to `native-app` automatically build a signed Android demo APK. Other branches and pull requests never invoke EAS builds. Manual builds remain available via **Mobile checks and APK** on `native-app`. It uses the repository's `EXPO_TOKEN` secret and the existing EAS preview profile/signing key. On success, download `online-gaming-demo-apk` from the workflow artifacts (retained 14 days). No token belongs in source control. Builds consume EAS quota and may incur charges under the account's plan. Runs on the same branch are serialized without cancelling an active build. The cloud build may continue if the Actions job times out; inspect EAS before rerunning to avoid duplicate builds.

This is APK delivery for testing, not automatic installation or store publication. Testers download and install the new APK. iOS bundle exports validate JavaScript only; signed iPhone builds/TestFlight require a separate signing and distribution setup and are not enabled here.

## Previous successful build

The manual workflow completed successfully on September 22, 2026:
https://github.com/dipeshss4/online-gaming-mobile/actions/runs/35693328050

Build profile: `preview`; package: `com.onlinegaming.preview`; AWS URL: `https://d3m8fr7e7xbses.cloudfront.net`. EAS stores the Android signing key. Download/install only after the selected run finishes successfully. Physical-device QA is still required.

The EAS `preview` profile produces an installable APK, not an AAB and not an Expo Go-only bundle. Initial Android package: `com.onlinegaming.preview`.

Prerequisites: sign in to Expo with `npx eas-cli login`, link the project to the intended Expo account, and configure `EXPO_PUBLIC_API_URL` in the EAS preview environment to the verified public HTTPS backend origin (without `/api`). Never put payment secrets or JWT secrets into mobile build variables. The build rejects missing/local/HTTP API URLs on EAS.

From this folder:

```sh
npx eas-cli build --platform android --profile preview
```

Project linkage and Android signing are already configured for the current Expo account. Local builds require an Android SDK and compatible JDK; CI builds use EAS instead.

Before deployment, authenticate to the existing AWS account, identify the current server and domain, back up the database and existing release, validate migrations and tests, and deploy only to that existing environment. Do not run the root `deploy-aws.sh` for a routine update: it provisions new VPC, EC2, and RDS resources.

After deployment verify HTTPS, health, login, catalog, crash, roulette and payment-method responses. Keep Stripe in test mode. Then build the APK and test on cellular data: sign-in, wallet, game transactions/recovery, background/resume, and hosted test checkout. Native checkout currently returns to the web URL; manually return to the app to refresh its server-confirmed status.
