# iOS release (App Store) via Codemagic

No Mac needed. Codemagic builds the app on its own Macs (current Xcode),
signs it with an App Store Connect API key, and uploads it to TestFlight.
The build config is `codemagic.yaml` at the repo root.

The Apple Developer account belongs to the client. The developer only needs
the API key the client creates in step 3; nobody shares an Apple ID password.

## Client: one-time setup (Apple account owner)

1. **Apple Developer Program**: enrol at developer.apple.com/programs
   ($99/year). Use an Organization account if the app should be published
   under the company's name.
2. **Register the app**:
   - developer.apple.com > Certificates, Identifiers & Profiles >
     Identifiers > + > App IDs > App: bundle ID
     `com.antigravity.virtualworld`.
   - appstoreconnect.apple.com > Apps > + > New App: platform iOS, name
     TeemChat, that bundle ID, SKU e.g. `teemchat-ios`.
3. **API key for Codemagic**: App Store Connect > Users and Access >
   Integrations > App Store Connect API > Team Keys > +, role **App Manager**.
   Send the developer, through a password manager or another secure channel
   (not plain email or chat):
   - the downloaded `.p8` file (it can only be downloaded once),
   - the **Key ID**,
   - the **Issuer ID** (shown above the keys list).

   The client can revoke this key at any time, which immediately cuts off
   Codemagic's access.
4. *(Optional)* Invite the developer to App Store Connect (Users and Access)
   with the App Manager or Developer role, so they can see TestFlight builds
   and fill in the listing.

## Developer: one-time setup in Codemagic

5. **Add the API key**: Codemagic > Personal Account > Integrations >
   Developer Portal > Connect. Upload the `.p8`, enter the Key ID and
   Issuer ID, and name it exactly `TeemChat App Store Connect` (the name
   `codemagic.yaml` uses).
6. **Certificate key**: Codemagic creates the App Store distribution
   certificate itself and needs a private key to do it. On any computer
   with Git Bash or WSL:

   ```bash
   ssh-keygen -t rsa -b 2048 -m PEM -f teemchat_cert_key -q -N ""
   ```

   In Codemagic > teemchat app > Environment variables, add a variable
   `CERTIFICATE_PRIVATE_KEY`, paste the whole contents of
   `teemchat_cert_key` (not the `.pub`), tick **Secret**, and put it in a
   group named `ios_signing`. Keep the key file safe (password manager):
   the same key reuses the same certificate on every build.
7. In Codemagic, press **Check for configuration files**. The
   `ios-testflight` workflow should appear.

## Every release

8. Commit and push to `main`, then in Codemagic: **Start new build** >
   branch `main` > workflow `iOS - TestFlight`. It takes about 10-20 minutes
   and uses the free 500 macOS minutes per month.
9. After Apple processes it (usually 10-30 minutes), the build appears in
   App Store Connect > TestFlight. Install **TestFlight** on an iPhone and
   test: login, Google sign-in, voice chat, the AI companion, and that no
   purchase buttons appear.
10. In App Store Connect, fill in the listing: 6.9" iPhone screenshots,
    description, keywords, support URL, privacy policy URL
    (`https://www.teemchat.chat/privacy`), age rating, App Privacy answers,
    and a demo login plus notes for the reviewer.
11. Select the build and **Submit for Review** (usually 1-3 days).

For a new store version, bump `MARKETING_VERSION` (e.g. 1.0 to 1.1) in
`ios/App/App.xcodeproj/project.pbxproj`; the build number increases
automatically.

## Review checklist

- **Account deletion**: Apple requires sign-up apps to let users delete
  their account inside the app.
- **Web-wrapper review (guideline 4.2)**: the app loads the live site, so
  mention the native features in the review notes: microphone voice chat,
  Google sign-in deep link, native status bar theming.
- **No in-app purchases of digital goods**: web checkout is hidden in the
  apps (`useIsNativeApp`), as Apple requires.
- **Encryption**: `ITSAppUsesNonExemptEncryption` is `false` in
  `Info.plist`; the app only uses standard HTTPS/WebRTC encryption, so
  App Store Connect won't ask the export-compliance question on each build.
  The client should confirm this matches their situation.
