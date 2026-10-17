# Step 00 — Scaffold and installable shell

**Depends on:** nothing.
**Ships:** an app on the phone's home screen that opens in airplane mode and tells you what
the phone is willing to give it.
**Requirements:** R-FIRST-3, R-FIRST-4, R-UPDATE-1, R-UPDATE-2, R-MODE-1, R-MODE-5.
**Done means:** you install it, walk out to a field, tap the icon, and it opens instantly
with a Diagnostics screen that is mostly green.

## Why this step exists

Everything later assumes the app can be installed, can start with no network, and can be
updated without the user losing data. Those three things are the parts of PWA work that go
wrong silently, and they are cheapest to fix before there is any data in the app. This step
also settles the deploy path, because the repo name becomes the PWA's scope and changing it
later means reinstalling and losing everything.

**Decide the app's name before the first deploy.** The repo name sets the GitHub Pages
subpath, which sets `start_url` and `scope`. "DetectorFinds" is the working title.

## Build

1. **Project.** Vite + React + TypeScript with `strict: true`. Use `npm.cmd` / `npx.cmd` on
   this machine — the PowerShell `npm.ps1` shim is blocked by execution policy.
2. **PWA.** `vite-plugin-pwa` in `generateSW` mode with `registerType: "prompt"`. The
   service worker precaches the app shell and caches nothing else yet — no tiles, no routes.
3. **Base path.** Set `base` to the GitHub Pages subpath (`/DetectorFinds/`). Verify the
   manifest's `start_url`, `scope` and icon URLs all resolve under that subpath. This is the
   single most common way a Pages-hosted PWA fails to install.
4. **Routing.** Hash routing. GitHub Pages cannot rewrite an unknown path back to
   `index.html`, and a service-worker navigation fallback only helps once the worker is
   already installed. Hash routing survives a hard reload of a deep link on a fresh install.
5. **Manifest.** `name`, `short_name` short enough to fit under an icon, `display:
   "standalone"`, `orientation: "portrait"`, `theme_color`, `background_color`, a 512 px
   icon plus a maskable variant. One light, high-contrast theme (R-MODE-5).
6. **App shell.** A bottom navigation bar with the destinations that will exist by step 09:
   Map, Finds, Sessions, Sites, Settings. Until their step arrives, each renders a
   placeholder naming the step that brings it. Do not build throwaway screens.
7. **Diagnostics screen** (R-FIRST-4), under Settings. Reports live:
   - app version, build time, and whether an update is waiting;
   - whether the service worker is controlling this page;
   - `navigator.storage.estimate()` usage and quota;
   - `navigator.storage.persist()` — granted or not;
   - geolocation, wake lock, File System Access (`showDirectoryPicker`), and IndexedDB,
     each as supported / unsupported;
   - a button to re-request persistence.
8. **Persistence request** (R-FIRST-3) on first run, with a plain-language reason: without
   it the browser may delete the database when disk fills. A rejection is not fatal, and
   Diagnostics keeps showing the state.
9. **Update prompt** (R-UPDATE-1): a toast saying "new version available — Refresh", with a
   dismiss control. It must not appear while a Session is open. There are no Sessions yet,
   so a stub flag is enough — but the flag must exist so step 05 can set it.
10. **Graceful degradation.** iOS and desktop must load without a crash. Feature-detect
    everything in Diagnostics rather than assuming it, and show a banner on iOS saying the
    app is built for Android.
11. **Deploy.** GitHub Pages, manual deploy for now. Root `README.md` carries the install
    instructions and the URL.
12. **Licence.** MIT, and the repo is public.

## Acceptance criteria

- [ ] On Android Chrome, the menu offers "Add to Home screen" and the install completes.
- [ ] In airplane mode, a cold start from the icon reaches the shell in under two seconds,
      with no blank screen and no console errors.
- [ ] Diagnostics shows: service worker controlling, IndexedDB supported, geolocation
      supported, wake lock supported, persistence granted.
- [ ] Redeploying a changed build and reopening the app shows the Refresh toast, and a value
      typed into a test field in Diagnostics survives the refresh.
- [ ] Reloading a deep link such as `/#/settings/diagnostics` on a fresh install works.
- [ ] Opening the URL on an iPhone renders the shell and the Android-only banner without
      throwing.
- [ ] Rotating the phone does not reflow the shell.

## Verify on a phone

1. Deploy to GitHub Pages. Open the URL in Chrome on the Android phone.
2. Install from the Chrome menu. Confirm the icon and the label under it.
3. Turn on airplane mode. Kill Chrome from Recents, then tap the icon. The shell must appear.
4. Open Settings → Diagnostics and read every line. Screenshot it; that screenshot is the
   baseline every later step is compared against.
5. With Chrome remote debugging attached (`chrome://inspect` on the desktop), confirm the
   Application tab shows the service worker as activated and the manifest as valid.
6. Push a trivial change, redeploy, reopen, and confirm the Refresh toast appears and that
   the test value survives.

## Commit

`git commit -m "step 00: installable PWA shell, diagnostics, update prompt, Pages deploy"`
