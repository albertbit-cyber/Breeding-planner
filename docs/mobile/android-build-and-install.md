# Breeding Planner Mobile Android Build

Breeding Planner Mobile is packaged as a Capacitor Android app around the mobile PWA route at `#/mobile`.

## App Identity

- App name: `Breeding Planner Mobile`
- Android package: `com.breedingplanner.mobile`
- Min SDK: `24`
- Target SDK: `36`
- Output directory copied by scripts: `dist/android`

## Environments

The Android build uses Vite environment files:

- Development: `.env.android-development`
- Staging: `.env.android-staging`
- Production: `.env.android-production`

Production must use HTTPS:

```powershell
$env:VITE_API_URL='https://api.breedingplanner.dev/api'
```

For Android emulator development, the default API URL is:

```text
http://10.0.2.2:4000/api
```

## One-Time Dependency Setup

Install Capacitor dependencies from the repo root:

```powershell
npm install
```

If Capacitor packages are missing, install:

```powershell
npm install @capacitor/core @capacitor/android @capacitor/app @capacitor/camera @capacitor/filesystem @capacitor/haptics @capacitor/keyboard @capacitor/network @capacitor/preferences @capacitor/push-notifications @capacitor/splash-screen @capacitor/status-bar
npm install -D @capacitor/cli
```

## Debug APK

```powershell
npm run android:debug
```

Output:

```text
dist/android/app-debug.apk
```

Install on a connected device:

```powershell
npm run android:install:debug
```

## Release Signing

Generate a keystore:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-android-keystore.ps1
```

For a local non-interactive release signing setup, generate the keystore and ignored `android/key.properties` file:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-android-keystore.ps1 -NonInteractive -WriteProperties
```

Back up both `android/app/breedingplanner.keystore` and `android/key.properties`. They are intentionally ignored by git.

Set signing variables before release builds:

```powershell
$env:BREEDING_PLANNER_KEYSTORE_FILE='D:\Git Clone\Breeding-planner\android\app\breedingplanner.keystore'
$env:BREEDING_PLANNER_KEYSTORE_PASSWORD='your-store-password'
$env:BREEDING_PLANNER_KEY_ALIAS='bpkey'
$env:BREEDING_PLANNER_KEY_PASSWORD='your-key-password'
```

Do not commit the keystore or passwords.

## Release APK

```powershell
npm run android:release:apk
```

Output:

```text
dist/android/app-release.apk
```

Direct installation:

```powershell
adb install -r dist/android/app-release.apk
```

Or transfer the APK to a phone, enable `Install unknown apps`, and open the APK.

Release builds are signed when `android/key.properties` or the signing environment variables are present. R8 shrinking is opt-in because it can be memory-heavy on local machines:

```powershell
cd android
.\gradlew assembleRelease -PenableReleaseOptimization
```

## Play Store AAB

```powershell
npm run android:release:aab
```

Output:

```text
dist/android/app-release.aab
```

Upload the AAB to Google Play Console. Use the internal testing track first, invite testers by email, then promote after validation.

## All Release Artifacts

```powershell
npm run android:release:all
```

This builds both:

- `dist/android/app-release.apk`
- `dist/android/app-release.aab`

## Permissions

Configured Android permissions:

- Camera: QR scanning
- Internet and network state: backend access and sync
- Photos/storage: animal photos/documents
- Notifications: future push alerts

## Mobile App Behavior

The app supports:

- Login with JWT-backed shared backend authentication
- QR scan to animal profile
- Fast feed, weight, shed, note, clean, and water logging
- Offline local queue and later sync
- Tier-based access checks with locked feature notices
- Rack mode, tasks, communication confirmations, lab and sales surfaces

## Verification Checklist

Before publishing:

- Build debug APK and install on a real Android device.
- Login against the target backend.
- Scan a QR and confirm the correct animal opens.
- Log feed, weight, shed, clean, water, and note.
- Turn off internet, log an action, reconnect, and sync.
- Confirm locked tier features show upgrade messages.
- Build signed release APK.
- Build signed release AAB.
- Upload AAB to Play Console internal testing.
