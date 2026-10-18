# Legend Desktop

The Electron desktop client for Legend (Windows / macOS / Linux). Same
features as the phone app, plus a **3D Network map** of your contacts, their
premises, and the Knows Connections between them.

## How it's built

Desktop does not fork Legend's logic. It imports the phone app's domain,
storage, grading, circles, Knows Connections, CSV import/export, auth and sync
code straight from `../LegendNetworkingApp/src` (alias `@legend/…`), and only
the views are desktop-native (React DOM). See the header of `vite.config.ts`
for the three mechanisms that make this work (shims, module redirects,
`dedupe`).

| Layer | Phone | Desktop |
| --- | --- | --- |
| Views | React Native screens in `app/` | React DOM screens in `src/screens/` |
| State | `ContactsProvider`, `AuthProvider`, `AppSettingsProvider`, `SyncProvider` | the **same** providers |
| SQLite vault | `expo-sqlite` (`expoSqlDriver.ts`) | `node:sqlite` in the Electron main process, reached via IPC (`src/platform/ipcSqlDriver.ts`) |
| Secrets | `expo-secure-store` | Electron `safeStorage` (OS keychain / DPAPI) |
| Links / files | `Linking`, share sheet, document picker | `shell.openExternal`, native open/save dialogs |

`node:sqlite` ships inside Electron's Node, so there is no native module to
rebuild per Electron version.

**Phone-only:** phone-book import (use CSV), push notifications, Google/Apple
sign-in (desktop confirms signups and password resets with the emailed
6-digit code). Texts and calls hand off to the OS (`sms:` / `tel:` — e.g.
Windows Phone Link) and are logged the same way the phone logs them.

## The 3D Network map

`src/network/graphModel.ts` (pure, unit-tested) builds the graph:

- **People** — one node per contact, colored by grade tier, sized by score.
- **Premises** — one hub per *distinct* premise (same kind + label, ignoring
  case/punctuation), shared by everyone who has it — this is what makes
  clusters visible.
- **Knows Connections** — bright links between people (strong links only).
- **You** — the center (your "me" contact if set), with faint spokes.

`src/network/NetworkGraph3D.tsx` renders it with `3d-force-graph` / three.js.
Click a node and its one-hop neighborhood (premises + Knows Connections, or a
premise's people) stays lit while the rest fades; labels appear, particles
run along its links, and the camera flies to frame the neighborhood. The side
panel lists everything around it (including "shares a premise with") so you
can hop node to node. Contacts have **Show in network** →
`/network?focus=<id>`.

## Running it

Node 22+ (`.nvmrc`). From this folder:

```
npm install
npm run dev        # Vite HMR + Electron; editing electron/*.ts restarts it
npm run typecheck && npm test
npm run smoke      # build, then drive the real app: seed a demo network,
                   # sign in, screenshot contacts + 3D map (no console errors)
npm run dist       # package installers into release/
```

Config comes from the phone app's `.env` (`../LegendNetworkingApp/.env`), so
both clients use the same backend; an optional `LegendDesktop/.env` overrides
it. With `APP_BACKEND=local`, sign in with `demo@unjadeddigital.com` /
`Password1`. The vault lives in Electron's userData folder (`legend.db`).

If the app opens as a bare Node process with no window, your shell has
`ELECTRON_RUN_AS_NODE` set (VS Code / Claude terminals do) — `npm run dev`
clears it for you; for `npx electron .` unset it first.
