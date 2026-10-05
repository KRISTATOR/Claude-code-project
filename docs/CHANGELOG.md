# Changelog

All notable changes to Zázemí. Versions follow [semver](https://semver.org/);
each milestone ends with a release.

## 0.1.0: Milestone 1a, accounts, secrecy and sync (2026-10-05)

**Database changes: run "Deploy database" (docs/SETUP.md, step 6) before
installing this version.**

### Added
- Supabase schema: teams, roster (people with or without accounts), members
  with roles (organizer, NPC actor, player), invites, and the generic
  `records` model with organizer-only `record_secrets`, access lists,
  attached people, links and history.
- One access rule, `private.can_read_as()`, implementing rules R1–R6 of
  `docs/PLAN.md` §2.4. A record inside a hidden game or world is hidden too.
  Every policy, "view as player" and "who can see this" uses it.
- Server functions: create a team, create and redeem invites, change roles
  and remove members (never the last organizer), set visibility atomically,
  list who can read a record, list what a person would see.
- Edge Function `admin-set-password`, so organizers can set a temporary
  password (no e-mail needed).
- Sign-up and sign-in. The session is stored encrypted by Windows (DPAPI).
- Onboarding: join a team with a code or create one. Invite links
  `zazemi://pozvanka/KOD` open the app.
- Worlds and games: create, edit (description, status, dates, venue),
  trash and restore.
- Visibility editor (organizers / chosen people or groups / everyone) and
  the **Kdo to opravdu vidí** panel, computed by the server.
- People: members and roles, roster, invites with expiry and usage limits.
- Local cache per account (IndexedDB) kept in sync incrementally. Every 10
  minutes, or on demand, it is reconciled by id, so anything that becomes
  hidden is deleted from the computer.
- Offline mode: the app opens from the cache read-only, with a banner; it
  tells a paused Supabase project apart from no internet.
- Command palette (Ctrl+K), sync status badge with "synchronize now",
  settings (password change, sign out, sign out and wipe local data, team
  name, JSON backup, connection, updates).
- Czech locale for Chromium (date fields show dd.mm.rrrr).
- Tests: 30 RLS tests (PGlite, local Postgres, and the official Supabase stack
  in CI), sync-engine unit tests, and end-to-end tests where an organizer and
  a player use the app at the same time against a real stack.
- `scripts/local-stack`: a local Supabase-like stack (Postgres, PostgREST,
  Supabase Auth) for development without Docker.
- CI: a job that starts the official Supabase stack, runs the RLS tests on it
  and the end-to-end tests against it. A manual "Deploy database" workflow.

### Fixed
- A sync requested while another was running could use the previous team.
- postgrest-js retried failed reads for up to 7 s, which delayed noticing
  that the computer is offline; sync reads no longer retry (the app re-syncs
  on its own schedule).

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
