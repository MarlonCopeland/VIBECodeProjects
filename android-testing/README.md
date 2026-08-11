# Android testing environment

Set up 2026-08-05 on this machine to run **VendorFinder** and **Legend** in
Expo Go on an Android emulator.

```powershell
.\android.ps1 VendorFinder     # boots AVD, installs Expo Go 2.32.x, starts Metro, opens the app
.\android.ps1 Legend
.\android.ps1 Legend -Clear    # same, but clears the Metro cache first
.\android.ps1 Legend -Stop     # shut that emulator down
```

Both can run at the same time — they use separate AVDs and separate ports.

---

## The one thing to understand

**Expo Go can only exist in one version per device.** Every build shares the
Android package id `host.exp.exponent`, and each Expo Go build supports exactly
one Expo SDK. These two apps are on different SDKs:

| App | Expo SDK | Needs Expo Go | AVD | Metro port | Emulator |
|---|---|---|---|---|---|
| VendorFinder | 52 | 2.32.20 (reports `2.32.19`) | `VendorFinder_SDK52` | 8082 | `emulator-5554` |
| Legend | 54 | 54.0.8 | `Legend_SDK54` | 8083 | `emulator-5556` |

The Play Store's Expo Go is **SDK 57** and runs *neither* app, which is why both
are sideloaded from Expo's official release repo. `android.ps1` checks the
installed `versionName` on each run and reinstalls only when it's wrong — so if
you ever do run both on one AVD, it self-corrects (at the cost of a ~200 MB
reinstall each switch). Two AVDs avoids that entirely.

> Long-term, upgrading VendorFinder from SDK 52 to 54 would collapse all of this
> to a single Expo Go and a single AVD. That's a real migration, not done here.

## What's installed

| Component | Version | Location |
|---|---|---|
| Android Studio | 2026.1.3.7 | `C:\Program Files\Android\Android Studio` |
| Android SDK | — | `%LOCALAPPDATA%\Android\Sdk` (~4.9 GB) |
| platform-tools (adb) | 37.0.1 | `…\Sdk\platform-tools` |
| emulator | 37.1.11 | `…\Sdk\emulator` |
| Platform + system image | android-35, `google_apis;x86_64` | `…\Sdk` |
| build-tools | 35.0.0 | `…\Sdk\build-tools` |
| Expo Go APKs | 2.32.20, 54.0.8 | `%LOCALAPPDATA%\Temp\android-setup` |

`ANDROID_HOME`, `ANDROID_SDK_ROOT`, and PATH entries for `platform-tools`,
`emulator`, and `cmdline-tools\latest\bin` were added at **user** scope. Open a
new terminal for them to take effect.

Both AVDs are Pixel 7 (1080x2400, density 420), tuned past the bare defaults:
GPU on, 4 GB RAM, 512 MB heap, hardware keyboard enabled.

> **If the Expo Go APKs get cleaned out of Temp**, re-download them — the URLs
> come from `https://api.expo.dev/v2/versions/latest` under
> `data.sdkVersions["52.0.0"].androidClientUrl` (and `"54.0.0"`).

## Gotchas hit during setup

- **Node versions pull in opposite directions.** The Expo CLI needs **Node 20**
  (SDK 52's config loader breaks on 22); `supabase-js` scripts need **Node 22**
  for native `WebSocket`. `nvm use` gets you Node 20 for anything Expo.
- **Legend needs `--offline`.** It sets `extra.eas.projectId`, so serving a
  manifest makes the CLI resolve the project owner online and then block on an
  interactive login prompt (`CommandError: Input is required...`). `--offline`
  skips the lookup; the only effect is an unsigned dev manifest, which Expo Go
  doesn't require. The script passes this automatically.
- **Push notifications don't work in Expo Go.** `expo-notifications` dropped
  Android remote-push support in SDK 53+. Legend logs this on every launch.
  Local notifications still work; **remote push needs a development build**
  (`npx expo run:android` or an EAS dev build).
- **Port 8081 is often taken** on this machine by another Metro, which is why
  these use 8082/8083.
- **`avdmanager -d pixel_7` prints a `devices.xml` error** — harmless, the
  profile still applies.
- **PowerShell's `>` corrupts binary.** For screenshots use
  `adb shell screencap -p /sdcard/s.png` then `adb pull`, not `adb exec-out … > file`.

## Physical phone (later)

Nothing more to install. Enable **Developer options -> USB debugging**, plug in,
accept the RSA prompt, then:

```powershell
adb devices                                   # confirm it's listed
adb -s <serial> install -r "$env:LOCALAPPDATA\Temp\android-setup\ExpoGo-54.0.8-sdk54.apk"
adb -s <serial> reverse tcp:8083 tcp:8083     # so localhost points at this PC
adb -s <serial> shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8083" host.exp.exponent
```

Swap the APK and port for VendorFinder (8082). `adb reverse` is what makes
`127.0.0.1` work over USB — no LAN IP or same-Wi-Fi requirement.
