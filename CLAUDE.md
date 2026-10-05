# CLAUDE.md: working on Zázemí

Zázemí is an Electron + React + TypeScript desktop app for Windows. It's the
backstage workspace for the Chýnický LARP organizers: a shared drive with
Office check-out/check-in, plus LARP planning tools. Supabase (EU) is the
backend.

The architecture, data model and milestones are in **`docs/PLAN.md`**. Read
it before changing anything structural, and update it when a decision
changes.

## Workflow

* Work one milestone at a time (see `docs/PLAN.md` §7). Since 2026-10-05 the
  owner asked to **continue to the next milestone without waiting** once a
  milestone is finished and tested (local checks and CI green).
* A milestone is done when tests pass, CI is green, `docs/CHANGELOG.md` is
  updated, and there's a short list of things the owner should try by hand
  on Windows.
* Commit in small steps. Message prefixes: `feat:`, `fix:`, `test:`,
  `docs:`, `ci:`, `chore:`, `refactor:`.
* **Ask before adding any dependency that costs money or needs an account.**
  Prefer MIT, Apache-2.0 or other permissive licenses. Avoid GPL in the
  shipped app.
* No analytics, telemetry or crash reporting to third parties.

## Hard rules

1. **No real game content or real personal data in the repo.** Seed data,
   fixtures and screenshots use invented Czech-sounding names and places.
   Real material is plot-secret; it lives only in Supabase.
2. **No service-role key anywhere in the repo or the build.** The app ships
   only the Supabase URL and the anon (publishable) key. Privileged actions
   go through Edge Functions, which get the service key from Supabase's
   environment.
3. **RLS is the only security boundary.** Every table has RLS enabled.
   Client-side hiding is convenience only.
4. **RLS is row-level, never column-level.** A field with a different audience
   goes in a different row (`record_secrets` for organizer-only fields, or a
   separate record).
5. **Read access is decided by one function, `private.can_read_as(...)`.**
   Policies, storage policies, "view as player" and "who can see this" all
   call it. Don't write a second, parallel access rule.
6. **New records default to `visibility = 'organizers'`.**
7. **Every new record kind or table gets RLS tests** in `tests/db/`, at least:
   an organizer can, the attached player or actor can, other players can't,
   an outsider can't.
8. **Players and NPC actors don't write through RLS.** The things they may
   do go through named server functions.

## Supabase conventions

* Schema changes go only in new timestamped files in `supabase/migrations/`.
  Never edit a migration that has been applied.
* Migrations must not break the previously released app version: expand
  first, contract in a later release. Bump `teams.min_app_version` only when
  that's unavoidable.
* Helper and security-definer functions live in the `private` schema (not
  exposed by the API), use `set search_path = ''`, and use fully qualified
  names.
* In policies, write `(select auth.uid())`, not a bare `auth.uid()` (it's
  evaluated once per query).
* Soft delete (`deleted_at`) for records. Hard delete only for personal data
  and pruned file versions.
* Every write path keeps the integer `rev` for optimistic concurrency.

## Electron conventions

* `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict
  CSP. Deny `window.open` and navigation. `shell.openExternal` only for
  `https:`.
* The preload exposes only `window.zazemi`, typed in `src/shared`. **Validate
  every IPC input with zod in main.** The renderer passes IDs, never
  filesystem paths.
* Internal paths are ASCII (`%APPDATA%\Zazemi`, `%LOCALAPPDATA%\Zazemi`).
  The display name is "Zázemí".
* Test-only hooks, such as the fake Office opener, are compiled in only when
  `ZAZEMI_TEST_BUILD` is set at build time. They never exist in release
  builds.

## Code conventions

* Strict TypeScript, no `any` (use `unknown` and narrow it). Use zod at every
  boundary: IPC, Supabase `data` JSON, imported files, CSV.
* Pure domain logic goes in `src/core`, with no Electron, DOM or Supabase
  imports, and unit tests next to it (`*.test.ts`).
* Record kinds are defined in one place, `src/core/kinds/<kind>.ts`: the zod
  schema for `data` and for the secret part, default visibility, searchable
  fields and link extraction.
* **UI strings come only from `src/renderer/i18n/cs.ts`.** No Czech or English
  literals in components. Use i18next plurals for counts (Czech has
  one/few/many/other).
* Format dates, numbers and money only through the `src/core/format` helpers
  (`cs-CZ`, decimal comma, non-breaking space as thousands separator). Number
  input must accept "1,5".
* Code, comments, commit messages and developer docs are in English. The
  user guide (M8) is in Czech.
* Layouts must work at 1366×768, in the light and dark themes, and by
  keyboard alone.

## Commands

```bash
npm install            # install dependencies
npm run check          # format, lint, typecheck, unit + RLS tests – run before every commit
npm run dev            # run the app in development (electron-vite)
npm run lint           # ESLint (type-aware)
npm run typecheck      # tsc --noEmit for node (main, preload, core, tests) and web (renderer)
npm run format:check   # Prettier (run `npm run format` to fix)
npm test               # Vitest: unit tests (+ RLS tests on PGlite from M1a)
npm run build          # electron-vite production build -> out/
npm run build:test     # same, with ZAZEMI_TEST_BUILD=1 (test hooks compiled in)
npm run test:e2e       # Playwright + Electron; needs `npm run build:test` first; on Linux: xvfb-run -a
npm run dist:win       # NSIS installer (Windows / CI only)
npm run dist:dir       # unpacked build for the current OS (quick packaging check)
npm run test:db        # only the RLS tests; ZAZEMI_TEST_DB_URL=postgres://… runs them on real Postgres
npm run stack          # local Supabase-like stack (foreground); `npm run stack:reset` wipes it
```

End-to-end tests that need a backend (`tests/e2e/team.spec.ts`) run against
the local stack when `.local-stack/env.json` exists, against
`ZAZEMI_E2E_SUPABASE_URL`/`_ANON_KEY` in CI, and are skipped otherwise.

Layout: `src/main` (Electron main), `src/preload` (bridge), `src/shared` (IPC
contract: `channels.ts` has no imports so the preload stays tiny; `ipc.ts` has
the zod schemas), `src/core` (pure logic), `src/renderer` (React UI).
Release workflow: `.github/workflows/release.yml`; installer config:
`electron-builder.yml`.

### Sandbox notes (Linux development container)

* `supabase.com` is blocked by the egress proxy, but the npm registry and
  GitHub release downloads work. Electron's binary download works too.
* Docker can start (`dockerd &`) but cannot pull image layers through the
  proxy, so the Supabase CLI stack does not work here. Use the local stack
  instead: `npm run stack` (Postgres 16 from the system, PostgREST and
  Supabase Auth binaries from GitHub releases, Supabase Storage built from a
  pinned git commit; no Realtime, no Edge Functions). Run it in the
  background and wait for `ready`; the first start builds Storage (~2 min).
  RLS tests: `ZAZEMI_TEST_DB_URL=postgres://postgres@127.0.0.1:54322/postgres npm run test:db`.
* Xvfb is available for end-to-end tests: `xvfb-run -a npm run test:e2e`.
* Playwright's own browsers are not installed (Electron tests don't need
  them). For ad-hoc Chromium use `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
* `electron-builder --win` gets as far as NSIS packaging and then needs Wine,
  which isn't installed. `npm run dist:dir` (Linux unpacked) works for a quick
  packaging check.
* Playwright silently drops files whose *path* contains non-ASCII characters
  when filling an Electron `<input type=file>`. Pass Czech-named files as
  `{ name, mimeType, buffer }` instead.
* Office is simulated in test builds: launch with `ZAZEMI_FAKE_OFFICE=edit`
  (save once, then close) or `keep-open` (save, stay open).
* Windows and Office can't be run here. The Windows runner in CI builds the
  installer, and the owner tests by hand.

## Decision log

| Date | Decision |
|---|---|
| 2026-10-05 | Supabase Free tier, EU region; Pro later without code changes. |
| 2026-10-05 | Roles: organizer, NPC actor (CP), player. |
| 2026-10-05 | Czech UI with typed i18n strings. |
| 2026-10-05 | This repo private; installers and update metadata published to the public repo `kristator/zazemi-releases`. |
| 2026-10-05 | One `records` table plus `record_secrets` for most entities, with a single access function (PLAN §2.4, §3). |
| 2026-10-05 | Local cache in renderer IndexedDB (Dexie), not SQLite, to avoid native modules. |
| 2026-10-05 | electron-vite 5 + Vite 7 until electron-vite 6 is stable. |
| 2026-10-05 | No email dependency: password sign-in, invite codes, organizer-set temporary passwords through an Edge Function. |
| 2026-10-05 | One file version per check-out session (Free tier storage). |
| 2026-10-05 | Milestone 1 split into 1a (accounts, secrecy, sync) and 1b (drive, Office); auto-update in M0; folder import in M1b. |
| 2026-10-05 | Rich text is TipTap JSON (free core only); `[[links]]` are `wikiLink` nodes, mirrored into `record_links` by a DB trigger. |
| 2026-10-05 | Owner: continue through milestones without waiting for review once each is tested. Open questions in PLAN §8 run on their defaults. |
| 2026-10-05 | A record inside a hidden game or world is hidden too (container rule in `can_read_as`). |
| 2026-10-05 | Sync reads disable postgrest-js retries; the engine re-syncs on a timer and on realtime pokes. |
| 2026-10-05 | Storage objects are named `<team>/<file>/<version>`; storage RLS reuses `can_read_id(file)`. One version row per check-out session; a save after losing the lock is a conflict version. |
| 2026-10-05 | Trashing a folder trashes its contents with the same timestamp; restoring restores them together. |
