# VIBES monorepo

What is left here:

| Directory | Stack | Node |
| --- | --- | --- |
| `UnjadedDigital/` | Expo template (Supabase) | see its `.nvmrc` |
| `android-testing/` | Emulator + Expo Go launcher for the apps below | n/a |

## Apps that moved to their own repos (2026-11-12)

| App | Now lives at | Remote |
| --- | --- | --- |
| Legend (phone) | `C:\repo\LegendNetworking\mobile` | `UnjadedDigitalProducts/LegendNetworking` |
| Legend Desktop | `C:\repo\LegendNetworking\desktop` | same repo |
| Vendor Finder | `C:\repo\VendorFinder` | `UnjadedDigitalProducts/VendorFinder` |
| BraMan | `C:\repo\BraMan` | its own repo |

History was carried over with `git subtree split`. Do new work on these apps
in their own repos, not here; the old `LegendNetworkingApp/`, `LegendDesktop/`,
and `VendorFinder/` folders were removed from this repo.

## Before running npm / npx / expo

1. **`cd` into the app directory first.** There is no `package.json` at the
   repo root, and `npm install` here silently creates a stray root
   `package.json` + `node_modules`. (This has happened; it is not hypothetical.)
2. **Check the Node version against that app's `.nvmrc`:** `node -v && cat .nvmrc`.
   Windows nvm switches globally, so say so before running `nvm use`.

## UI design work

The Anthropic `frontend-design` skill is vendored at
`.claude/skills/frontend-design/` (upstream: `anthropics/skills`, Apache-2.0).
Use it for any new screen, redesign, or visual polish in **UnjadedDigital**.
LegendNetworking and VendorFinder carry their own copies.

These are Expo / React Native apps, so translate the skill's web
guidance: CSS tokens → a theme object / `StyleSheet`, Google Fonts →
`expo-font`, hover states → press feedback, and respect each app's existing
theme files rather than inventing a parallel palette.
