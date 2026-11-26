# Fractal Goals for Mac

The Mac app is the web app's own build (`client/dist`) in a [Tauri 2](https://tauri.app) window,
with what a browser can't offer added by this shell:

| | Where |
|---|---|
| Sign-in kept in the Keychain, a refresh token per Mac | `src/secrets.rs`, `client/src/platform/nativeSession.js` |
| Unsent changes in files the app owns, one per change, written to disk before the app says "saved" | `src/queue.rs`, `client/src/offline/shellStore.js` |
| Menus with shortcuts (⌘1–5 pages, ⌘N new session, ⌘, Settings, ⌘[ ⌘] back and forward) | `src/menu.rs`, `client/src/platform/NativeShellBridge.jsx` |
| The running session's time in the menu bar; closing the window keeps the app running | `src/timer.rs`, `src/window.rs` |
| Reminders as macOS notifications, switched on in Settings → General | `src/notifications.rs`, `client/src/platform/reminders.js` |
| `fractalgoals://` links, cloud-storage consent in the system sign-in window, saving files, links opened in the browser | `src/links.rs`, `src/authorize.rs`, `src/save.rs` |

The client finds the shell as `globalThis.__FRACTAL_SHELL__` (`src/shell.js`, documented in
`client/src/platform/index.js`); nothing outside `client/src/platform/` may ask which it runs in.

## Building

Needs Rust (`rustup`) and Node. No Xcode or Apple account is needed for an unsigned build.

```sh
npm install
npm run build         # client/dist, then target/release/bundle/macos/Fractal Goals.app
npm run build:local   # "Fractal Goals Dev.app", against your local server (below)
npm run icons         # after `npm run brand:assets` in client/ changes the logo
```

`FRACTAL_APP_URL` (default `https://my.fractalgoals.com`) and `FRACTAL_BUILD` (compared with the server's
`MIN_SUPPORTED_BUILDS`) are read at build time. The server must list `tauri://localhost` in `CORS_ORIGINS`.

`build:local` makes a separate app, "Fractal Goals Dev" (`local.conf.json`), that talks to the dev server at
`http://127.0.0.1:8001` and so to your local database. Its own bundle id keeps its Keychain sign-in and saved
data apart from the real app's. Add `tauri://localhost` to `CORS_ORIGINS` in the env file your dev server loads (`.env.<ENV>`) and restart the
dev server first.

## Testing

```sh
cargo test            # the queue, links, timer and which pages may load
npm run smoke         # the real app, built with --features smoke, against scripts/browser_test_server.py
```

The smoke run opens the app four times: it signs in, reopens still signed in with the session in the
menu bar, edits a goal while the server can't be reached and quits, then reopens and checks the edit
reached the server. Its window appears on screen while it runs. `client/e2e/native-shell.spec.js` runs
the same client against a pretend shell in Chromium and WebKit.

## Not yet

- Signing with a Developer ID, notarization and automatic updates need an Apple Developer account.
  Until then each build is signed ad hoc, so macOS asks again for the Keychain after an update.
- Universal links (`https://my.fractalgoals.com/...` opening the app) need the same account.
