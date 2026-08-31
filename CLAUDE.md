# VIBES monorepo

Several independent apps live side by side, each with its own `package.json`,
`node_modules`, and Node requirement:

| Directory | Stack | Node |
| --- | --- | --- |
| `LegendNetworkingApp/` | Expo SDK 54 + Supabase | **>=22** (`.nvmrc` = 22) |
| `Net_Delver/` | Godot 4.6 | n/a |
| `UnjadedDigital/`, `VendorFinder/` | Expo templates | see each `.nvmrc` |

## Before running npm / npx / expo / eas

1. **`cd` into the app directory first.** These commands must never run from
   the repo root — there is no `package.json` there, and `npm install` at the
   root silently creates a stray root `package.json` + `node_modules` that
   shadows the real one. (This has happened; it is not hypothetical.)
2. **Check the Node version against that app's `.nvmrc`:**
   ```
   node -v && cat .nvmrc
   ```
   Mismatches do not fail loudly — they fail *silently and partially*. Node 20
   in LegendNetworkingApp installs fine, typechecks fine, and simply skips
   `test/sqliteContacts.test.ts` because `node:sqlite` does not exist before
   Node 22, so the suite reports green-ish while a whole file never ran.
3. Switch with `nvm use 22.17.0` (Windows nvm switches globally — say so before
   changing it, since other projects in this repo may be pinned elsewhere).

`engine-strict=true` in `LegendNetworkingApp/.npmrc` makes `engines` a real
gate for installs, but it does not cover `npm test` / `npm run` — hence the
manual check above.

## Verifying LegendNetworkingApp

```
npm run typecheck && npm run check:imports && npm test
```

`check:imports` catches imports that resolve on Windows but break on EAS's
case-sensitive Linux builders, or that are untracked by git (EAS builds from
the git archive, not the working tree).
