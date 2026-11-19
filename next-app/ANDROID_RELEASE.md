# Android release (Google Play)

The Android app is a Capacitor shell that loads the live site
(`https://www.teemchat.chat`, set in `capacitor.config.ts`). Web changes deployed
to Vercel show up in the app without a new store upload. You only need to
rebuild for native changes (icons, plugins, permissions, app version).

## Prerequisites

Install [Android Studio](https://developer.android.com/studio). It bundles the
JDK and Android SDK that Gradle needs. Open `next-app/android` in it once so it
downloads the SDK and writes `android/local.properties`.

## 1. Create the upload keystore (once, ever)

From `next-app/android`, using the `keytool` bundled with Android Studio
(Windows path shown):

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore teemchat-release.jks -alias teemchat -keyalg RSA -keysize 2048 -validity 10000
```

Then copy `keystore.properties.example` to `keystore.properties` and fill in the
passwords you chose. Both files are git-ignored.

**Back up `teemchat-release.jks` and its passwords somewhere safe (a password
manager plus an offline copy).** With Play App Signing (the default for new apps)
this is your *upload* key. If you lose it, Google can reset it, but that takes a
support request and some time.

## 2. Build the bundle

From `next-app/`:

```powershell
npm run aab:release
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## 3. Upload

In Play Console: create the app, then go to *Testing > Internal testing* (or
Production), create a release and upload the `.aab`. Before you can publish,
Play also needs the store listing, a privacy policy URL, the Data safety form,
the content rating questionnaire, and a declaration for the microphone
permission (voice chat).

## Every later update

1. Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`.
2. `npm run aab:release`
3. Upload the new `.aab`.

## Local device testing against the dev server

```powershell
$env:CAPACITOR_SERVER_URL = "http://<your-LAN-IP>:3000"; npx cap sync android
```

Debug builds allow plain `http://`. Release builds only allow HTTPS. Before you
build a release, clear the variable (`Remove-Item Env:CAPACITOR_SERVER_URL`) or
open a new terminal.
