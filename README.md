# JSB Fleet Ops — Android app

Your `JSB_Fleet_Operations_v5` web app, packaged as an Android app with Capacitor.
The app is in `www/index.html`. It still uses your same Supabase database, so data
stays in sync between the phone app and the browser version.

## Get the APK (no software to install)

1. Create a free account at github.com and make a new **private** repository.
2. On the repository page click **Add file → Upload files**, and drag in everything
   from this folder (including the hidden `.github` folder — if your computer hides it,
   upload the `.github/workflows/build-apk.yml` file separately into that same path).
3. Click **Commit changes**. GitHub starts building automatically.
4. Open the **Actions** tab, wait for the green check (about 5–8 minutes), click the run,
   and download **JSB-Fleet-Ops-APK** under *Artifacts*. Unzip it to get `JSB-Fleet-Ops.apk`.
5. Send the APK to the phone and open it. Android will ask to allow installing from
   this source — allow it once.

## Updating the app later

Replace `www/index.html` with your new version (keep the 4 `<script src="vendor/...">`
and `native-bridge.js` lines exactly as they are in this copy), upload it to GitHub,
and a new APK is built. Increase `versionCode` in `android/app/build.gradle`
(1 → 2 → 3...) so phones accept it as an update without uninstalling.

## What was changed for the phone

- The three libraries (Supabase, jsPDF, html2canvas) are bundled in `www/vendor/`
  instead of loaded from the internet at startup.
- `www/native-bridge.js` makes buttons that don't work inside Android apps work:
  PDF / Excel / JPG / backup downloads are saved to **Documents/JSB Fleet** and the
  share sheet opens (WhatsApp, Drive, email); **Print** creates a PDF instead;
  opening a PDF attachment hands it to the phone's PDF viewer; the Android back
  button closes popups first. In a normal browser this file does nothing.
- App icon and splash screen use the JSB logo.

## Building on your own computer instead

Install Node.js 22, JDK 21 and Android Studio, then in this folder:

    npm install
    npx cap sync android
    npx cap open android     # then Build → Build APK(s)

## Notes

- This is a debug-signed APK — fine for installing on company phones.
  Publishing on the Google Play Store needs a release signing key.
- App ID: `com.jsbgroup.fleetops`. Don't change it after people install the app,
  or updates won't replace the old version.
