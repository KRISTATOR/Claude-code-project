# Changelog

All notable changes to Zázemí. Versions follow [semver](https://semver.org/);
each milestone ends with a release.

## 0.0.1: Milestone 0, skeleton (2026-10-05)

### Added
- Electron + React + TypeScript app (electron-vite 5, Vite 7, strict TypeScript).
- Security baseline: sandboxed renderer with context isolation and no Node
  access; the renderer is served over `app://` with a strict
  Content-Security-Policy; new windows, navigation, webviews and permission
  prompts are blocked; a single typed `window.zazemi` preload API; every IPC
  input is validated with zod in main.
- First-run screen "Zázemí zatím není připojené": paste a connection code or
  a Supabase URL and anon key. The app refuses service-role and secret keys.
  Release builds can have the connection baked in from GitHub repository
  variables.
- Czech UI through i18next, with every string in `src/renderer/i18n/cs.ts`
  and Czech plural forms.
- Light, dark and system theme.
- Czech number, money, date and file-size formatting, and parsing of numbers
  typed with a decimal comma.
- Auto-update through electron-updater from the public `zazemi-releases`
  repo, with a "Restartovat a aktualizovat" bar.
- Per-user NSIS installer `Zazemi-Setup-x.y.z.exe` (no administrator rights)
  that registers the `zazemi://` protocol for invite links.
- GitHub Actions: CI on every push (format, lint, typecheck, unit tests, a
  build, and Playwright end-to-end tests of the Electron app); a Windows
  release workflow on `v*` tags, with a marked code-signing slot.
- Docs: `README.md` (install, SmartScreen, honest limits), `docs/SETUP.md`,
  `docs/PLAN.md`, `CLAUDE.md`.

### Fixed during development
- Electron's default User-Agent contains the product name "Zázemí". Its
  non-ASCII characters crashed requests to the app's own `app://` protocol,
  so the User-Agent is now made ASCII-only.
