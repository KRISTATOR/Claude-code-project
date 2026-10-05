# Zázemí: plan

Status: **draft for review, before Milestone 0.** Nothing below is built yet.
Last updated: 2026-10-05.

Zázemí is a Windows desktop app for the Chýnický LARP organizers. It has two
jobs: a shared drive that opens files in the real Microsoft Office apps, and
purpose-built LARP planning tools (characters, lore, timeline, prop documents,
items, maps, logistics, a live-game dashboard). About 5 organizers use it
heavily and about 10–30 players and NPC actors use it lightly. All content is
Czech.

---

## 0. Confirmed decisions

| # | Topic | Decision (confirmed 2026-10-05) |
|---|---|---|
| D1 | Shared data | **Supabase Free tier, EU region** (Frankfurt). Postgres, Auth, Storage, Realtime. Moving to Pro ($25/month) needs no code changes. |
| D2 | Accounts | **Organizers, NPC actors (CP) and players**, each with a role in the team. |
| D3 | UI language | **Czech**, every string in one i18n file (`src/renderer/i18n/cs.ts`) with typed keys. English can be added by translating that file. |
| D4 | Repositories | **This repo stays private** (source code). A second, **public** repo `kristator/zazemi-releases` holds only installers and update metadata, so players can download the `.exe` and auto-update works without a GitHub token inside the app. |
| D5 | Content | Real game content and real people's data never go into either repo. All seed and test data is invented. |

### Supabase Free tier and what it means for us

supabase.com is blocked from the development sandbox, so these figures come
from several independent 2026 write-ups that agree with each other. Check them
on supabase.com/pricing when you create the project.

| Limit (Free) | Effect on Zázemí | What the app does about it |
|---|---|---|
| 1 GB file storage | Tightest limit. The two existing 20 MB PDFs use 4 %. Every saved version is a full copy. | One version per check-out session (§2.6), a retention rule, and a storage meter in settings that warns at 70 % and 90 %. |
| 50 MB per file | The existing PDFs fit. Big scans, videos, or a generated archive with many scans may not. | The size is checked before upload, with a clear Czech message. |
| 5 GB egress / month | Every download counts. | A content-addressed local cache: each file version is downloaded once per computer. |
| 500 MB database | Plenty, because planning data is text. | — |
| 200 realtime connections, 50k MAU | Far beyond ~35 people. | — |
| Paused after 7 days without activity | This will happen between games. Data is kept, but someone has to click "Restore" in the Supabase dashboard. | The app recognises a paused project and explains what to do. |
| No backups | Plot material would have no server-side backup. | An organizer "Záloha" (backup) export from Milestone 1 (§2.12). |

---

## 1. Where this plan departs from the brief, and why

You asked me to say so if the order should change or something is a bad
idea. These are my proposals. Each one is easy to reverse if you disagree.

1. **Split Milestone 1 into 1a and 1b.** As written, M1 covers accounts,
   invites, roles, World → Game, the secrecy model, the local cache, the file
   tree, previews, Office check-out and versions. That's too much to review in
   one stop. 1a is accounts, secrecy and sync. 1b is the drive.
2. **Phases and blocks start in M2, not M3.** The NPC schedule (M2) already
   needs "game block", and later documents, items, menus and prices all hang
   off phases. In M2 they are basic records; M3 adds the run-of-show timeline
   and the per-phase checklist.
3. **Items the brief doesn't assign to a milestone:** the rules editor
   (sections, glossary, versions, "what changed since v1") goes in **M3**,
   with player-rulebook PDF export in **M4**. Cloning a game as a sequel goes
   in **M3**. The character diary and location signs go in **M4**, because
   they use the print pipeline.
4. **Auto-update is wired in M0, not M8.** Every later milestone reaches you
   through it, so you install the `.exe` (and click past SmartScreen) once
   instead of once per milestone. It works once `zazemi-releases` and its
   token exist (see `docs/SETUP.md`, written in M0).
5. **Import material from Google Drive in M1b, not only M8.** The drive is
   useless until your existing material is in it. M1b supports dragging a
   whole folder (from a Google Drive download) into the app, keeping the
   folder structure. M8 adds the polish: `.zip` and multi-part Takeout
   archives, Google's `(1)` duplicate names, skipped Forms and link stubs,
   and an import report.
6. **Backup export in M1, not later.** The Free tier has no backups. An
   organizer can export everything (records as JSON plus the current version
   of every file) to a `.zip` on their disk. Personal data is excluded unless
   they tick a box. Restoring from a backup comes in M8.
7. **M7 includes a small offline outbox.** The brief puts queued offline edits
   in M8, but M7 needs "the log syncs when the connection returns". So M7
   queues only actions that can't conflict: appending to the event log,
   recording tracker readings, and marking a letter delivered. General
   offline editing, where two people can change the same record, stays in M8.
8. **Players and NPC actors are read-only in v1.** The few things they can
   do (join a team, fill in their own registration in M6, answer a feedback
   survey) go through named server functions. This keeps the write-side
   security small and auditable. Tell me if players should be able to edit
   something, for example their own costume notes.
9. **The consistency checker has an honest scope.** It will find
   near-duplicate names ("Lipnice"/"Lipnov"), dangling `[[links]]`,
   references to numbered documents that don't exist, and conflicts between
   structured facts (a house number, age or title in a character record that
   differs from the canon registry). It won't understand prose contradictions
   like "arrived in spring" versus "arrived in autumn". That would need an AI
   service, which costs money, needs an account, and would send plot secrets
   to a third party.
10. **One version per check-out session.** Pressing Ctrl+S thirty times while
    editing shouldn't store thirty 20 MB copies. Saves during a check-out are
    uploaded immediately so nothing is lost, but at check-in only the last one
    is kept as a version. "Uložit jako verzi" keeps an intermediate state on
    purpose.
11. **The local cache is IndexedDB in the renderer (Dexie), not SQLite in the
    main process.** SQLite in Electron needs a native module rebuilt for each
    Electron version. That is a common source of broken Windows builds, and
    I can't test them on Linux. IndexedDB is built into Chromium and is
    enough for our data size.
12. **One `records` table for almost everything,** instead of roughly 40 typed
    tables. The reason is secrecy: one visibility model, one access function
    and one test matrix, instead of 40 sets of policies where one mistake
    leaks a plot. Details in §2.4 and §3.
13. **Vite 7, not 8.** electron-vite 5 (stable) supports Vite only up to 7.
    We move to Vite 8 when electron-vite 6 leaves beta.
14. **No dependency on email.** Supabase's built-in email delivers only to
    members of your Supabase organization, and only a few per hour, so
    invitation and password-reset emails wouldn't reach players. Instead:
    email and password sign-in with email confirmation switched off, team
    access only through an invite code, and passwords reset by an organizer
    through a small Edge Function. A real email provider can be added later,
    but it needs an account, so I'd ask first.
15. **No OCR.** Scanned PDFs without a text layer aren't searchable by
    content. They're still searchable by name and tags.

---

## 2. Architecture

### 2.1 Overview

```
┌───────────────────────────── Windows PC ───────────────────────────────┐
│ Electron main process (Node)        │ Renderer (React, sandboxed)       │
│  • window, single instance, menus   │  • UI (Mantine), Czech i18n       │
│  • Office: working folder, open,  ◄─┼─► • Supabase client: auth,        │
│    watch saves, watch ~$ lock files │     queries, realtime             │
│  • blob cache on disk (sha256)  IPC │  • sync engine                    │
│  • print to PDF, save dialogs  via  │  • local cache (IndexedDB/Dexie)  │
│  • auto-update                 typed│  • search index (MiniSearch)      │
│  • safeStorage for session     pre- │  • domain logic from src/core     │
│                                load │                                   │
└───────────────────────────────────────────────┬────────────────────────┘
                                                │ HTTPS / WSS, RLS enforced
                                   ┌────────────▼─────────────┐
                                   │ Supabase (EU, Frankfurt) │
                                   │ Postgres + RLS policies  │
                                   │ Auth, Storage, Realtime  │
                                   │ 1 Edge Function          │
                                   └──────────────────────────┘
```

* **Main process** does what needs the operating system: files on disk,
  launching Office, watching the working folder, printing to PDF, updates,
  and encrypting the session token with Windows DPAPI (`safeStorage`).
* **Renderer** does everything else, including talking to Supabase. This
  keeps the preload API narrow. It carries a handful of operating-system
  actions, not every database query.
* **`src/core`** holds pure TypeScript domain logic: shopping-list maths,
  the travel calculator, the consistency checker, Czech text normalisation,
  record schemas and game cloning. It has no Electron or DOM dependencies,
  and it's where most unit tests live.

### 2.2 Electron security baseline

* `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
* A strict Content-Security-Policy. `connect-src` allows only the app itself
  and the configured Supabase URL (`https:` and `wss:`). No remote scripts.
* All `window.open` calls and in-app navigation are denied. External links
  open in the browser through `shell.openExternal`, for `https:` only.
* The preload exposes one typed object, `window.zazemi`. Every IPC handler
  validates its input with zod. The renderer never sends file paths: it sends
  IDs, and main maps them to paths inside its own folders.
* Single-instance lock. The `zazemi://` protocol is used only for invite
  links, which are parsed and validated before use.
* Internal paths are ASCII (`%APPDATA%\Zazemi`, `%LOCALAPPDATA%\Zazemi`).
  The display name is "Zázemí".

### 2.3 Data flow and sync

* **Supabase is the source of truth.** The renderer reads only from the local
  cache, so the UI is instant and works offline. Writes go to Supabase first;
  only the confirmed row is written into the cache. Until M8, writes need a
  connection.
* **One cache database per account** (`zazemi-<userId>`). Switching accounts
  on a shared laptop (the backstage tent) never mixes data. "Odhlásit a
  smazat data z tohoto počítače" (sign out and delete local data) wipes it.
* **Pull:** for each table, fetch rows with `updated_at` later than the last
  sync minus a two-minute overlap. The overlap catches transactions that
  commit out of order. Upserts are idempotent. Deletes are soft
  (`deleted_at`), so they arrive like any other change.
* **Revocation:** when a record becomes hidden from someone, RLS stops
  returning it, so an incremental pull can't tell them to delete it. At every
  sync start, and every 10 minutes, the client fetches the list of `(id,
  updated_at)` it may still see and deletes local rows that aren't on it.
  That's how a secret removed from a player's view also disappears from
  their laptop.
* **Realtime** is used only as a poke. A `postgres_changes` event (which
  Supabase filters through RLS) triggers a normal pull.
* **Concurrent edits:** every record has an integer `rev`, and an update only
  succeeds `where rev = expected`. If someone else changed the record in the
  meantime, the UI offers to reload, overwrite or show both.
* **File bytes** live in a content-addressed blob cache on disk
  (`cache/blobs/<sha256>`), managed by main. Each version is downloaded once.
* **Schema evolution:** players update at different times, so a migration
  must not break the previous released app version (expand first, contract in
  a later release). The server publishes `min_app_version`; an older app asks
  the user to update instead of failing in odd ways.

### 2.4 Secrecy model (the most important part)

**Principles**

1. **RLS is the only protection.** The client hides things for convenience,
   never for security. A player's app only ever receives rows that player may
   read.
2. **RLS works on rows, never on columns.** A field with a different audience
   lives in a different row:
   * `records.data` has the record's own audience.
   * `record_secrets.data` is for organizers only: a quest's resolution, a
     document's organizer notes, a plot thread's truth, "dies in phase IV".
   * A character's public cast-list entry, if you want one, is its own
     record (`character_profile`) with its own visibility.
3. **New records default to "organizers only".** A new item in a folder
   starts with the folder's setting.
4. **One SQL function decides read access:** `private.can_read_as(role,
   person_id, record)`. Table policies, storage policies, Realtime, "view as
   player" and "who can see this" all call it. One implementation, tested by
   a matrix.

**Who can read a record** (any one rule is enough):

| Rule | Who |
|---|---|
| R1 | Organizers of the team: everything. |
| R2 | `visibility = everyone`: every team member. |
| R3 | `visibility = specific`: the people listed in `record_access`, by person or by group ("all NPC actors", "all players"). |
| R4 | People attached to the record: the player of a character, the actor of an NPC. |
| R5 | Children that inherit from their owner (an NPC's appearances and props, a character's hooks): whoever R4 lets read the owner. |
| R6 | Relationships: the players of characters on a side that knows about it. This is how one side can be secret from the other. |

**Writes:** organizers only (RLS), plus named server functions for the few
things others may do (§1, item 8).

**Folders:** visibility is checked per item, not inherited at read time.
Inherited checks are slow in RLS, and you'd be surprised when moving a file
silently changed who sees it. A file you may see inside a folder you may not
see shows up under "Sdíleno se mnou" (shared with me). When you change a
folder's visibility, the app offers to apply it to everything inside.

**"View as player":** an organizer-only server function,
`visible_record_ids(person_id)`, runs the same `can_read_as` for that
person. The organizer's app then shows its own cache filtered to those IDs,
read-only, with a banner. Because it's the same function RLS uses, the
preview can't drift from what the player really sees. It also works for
roster people who have no account yet.

**"Kdo to vidí?" (who can see this):** every record has a panel listing the
people who can read it, computed by the same function the other way round.

**Local data on organizer laptops:** an organizer's cache contains every
secret, unencrypted on disk. The README recommends Windows device
encryption or BitLocker. A player's cache contains only what that player may
read.

### 2.5 Accounts, teams and invites

* **Sign-in** uses Supabase Auth with email and password. Email confirmation
  is switched off (a `SETUP.md` step). Anyone can create an account, but an
  account that isn't in a team sees nothing, because RLS denies everything.
* **The first organizer** creates the team with `create_team(name)`.
* **Invites:** an organizer creates an invite with a role, an optional link to
  an existing roster person, an expiry and a maximum number of uses. They get
  a code like `LIPNO-7K3Q` and a link `zazemi://pozvanka/LIPNO-7K3Q`. The
  invitee redeems it with `join_team(code)`.
* **People and accounts are separate.** `people` is the team roster: a player
  who never installs the app still has a row, so they can be cast and
  appear in exports. A person can later be linked to an account.
* **Password reset:** an organizer clicks "Nastavit dočasné heslo" (set a
  temporary password). This calls the Edge Function `admin-set-password`,
  which checks that the caller is an organizer of the target's team and uses
  the service key that Supabase injects into Edge Functions. That key is
  never in the repo or the app.

### 2.6 Files and Office: check-out and check-in

**Opening a file for editing (double-click):**

1. `checkout_file(file_id)` takes the lock atomically, or fails with "Kvido
   upravuje tento soubor" (Kvido is editing this) and an offer to open a
   read-only copy.
2. Main downloads the current version (or takes it from the blob cache) into
   its own folder per file, `%LOCALAPPDATA%\Zazemi\w\<short-id>\<original
   name>`. The original name keeps Word's title bar readable, and one folder
   per file makes Office lock files trivial to detect.
3. Main runs `shell.openPath`, which opens Word, Excel, PowerPoint or
   whatever app is registered for the file type.
4. **Saves:** main watches the folder. When the file's hash changes and stays
   stable for two seconds (Office saves through a temp file and a rename), the
   new bytes are uploaded and recorded as the session's working version.
5. **Heartbeat:** every 60 s while the file is checked out. A lock expires
   10 minutes after the last heartbeat, so a crashed app or a dead laptop
   frees it. An organizer can force-release a lock at any time.
6. **Check-in:** when every Office lock file in that folder disappears
   (`~$name.docx` from Microsoft Office, `.~lock.name#` from LibreOffice), or
   the user clicks "Hotovo" (done), the last save becomes a new version and
   the lock is released. The local copy is set read-only, so reopening it from
   Word's recent files shows a read-only document.
7. **Apps without lock files** (Notepad, image viewers) are handled by a
   persistent panel, "Rozpracované soubory" (files in progress), with a
   "Hotovo" button for each file.

**Read-only copy:** downloaded into a separate folder with the read-only
attribute set, then opened.

**Lost lock** (offline at the farm for more than 10 minutes while someone
else checked the file out): the later upload is saved as a **conflict
version** next to the other person's version. Nothing is overwritten and
both are in the history.

**Startup scan:** if a working copy changed while the app wasn't running, the
app offers to upload it, as a normal version if nobody else changed the file,
otherwise as a conflict version.

**Version history** lists who, when, size and an optional label for each
version, with restore (which creates a new version from an old one) and pin
(exempt from retention).

**Honest limit, shown in the UI and README:** this is check-out/check-in.
Two people can't type in the same Word document at once. Real simultaneous
co-authoring needs the files to live in OneDrive/SharePoint, which is why
storage sits behind a `StorageProvider` interface. A Microsoft Graph provider
can be added later without touching the UI.

```ts
interface StorageProvider {
  upload(fileId: string, versionId: string, bytes: Uint8Array, mime: string): Promise<void>;
  download(fileId: string, versionId: string): Promise<Uint8Array>;
  remove(fileId: string, versionId: string): Promise<void>;
  usage(): Promise<{ usedBytes: number; limitBytes: number | null }>;
  readonly maxFileBytes: number | null;
}
```

Locks and version metadata live in Postgres no matter which provider holds
the bytes.

### 2.7 Previews

| Format | How it's previewed | Library |
|---|---|---|
| `.docx` | Rendered to HTML, sanitized | docx-preview |
| `.xlsx` | Table view, one tab per sheet | ExcelJS |
| `.pdf` | Page viewer | pdf.js (`pdfjs-dist`) |
| Images | Inline, zoomable | browser |
| `.txt`, `.md` | Text or rendered Markdown, sanitized | markdown-it + DOMPurify |
| `.pptx` | Card with the embedded preview picture (if the file has one), slide titles and text, and "Otevřít v PowerPointu" (open in PowerPoint) | own zip/XML reader |

### 2.8 Search, with Czech handled properly

* Search runs in the renderer over the local cache, so it works offline and
  only ever covers what the user may read. The library is MiniSearch.
* Normalisation, applied to both the index and the query: lowercase, strip
  diacritics (NFD), a light Czech suffix stemmer, prefix matching, and
  fuzzy matching (one edit) for words of five letters or more. So "Lipnov"
  finds "Lipnově", and "zamek" finds "zámku". This is covered by unit tests
  with a Czech word list.
* File text (docx, xlsx, pptx, pdf, txt, md) is extracted on the uploader's
  computer and stored in `file_text`, which has the same audience as the
  file.
* Ctrl+K opens a command palette for search and navigation. The live
  dashboard's quick lookup (M7) reuses it.

### 2.9 Printing and export

* Print templates are HTML and CSS rendered by React. A hidden window with
  JavaScript disabled loads them, and `printToPDF` produces A4 or A5 pages
  (CSS `@page`). Bundled fonts are embedded in the PDF automatically.
* **pdf-lib** merges PDFs and adds stamps: the archive builder, shelf marks,
  page numbers, and supplements that don't renumber pages already printed.
* **DOCX output:** the `docx` library for generated documents, and
  **docxtemplater** (free core, no paid modules) for your own templates with
  tags like `{postava.jmeno}`. **ExcelJS** for `.xlsx` output.
* DOCX output depends on the fonts installed on the computer that opens it.
  The app can install the bundled fonts for the current user, which doesn't
  need administrator rights on Windows 10 or 11.
* A build-time test rejects any bundled font missing a glyph from
  `ěščřžýáíéúůďťň ĚŠČŘŽÝÁÍÉÚŮĎŤŇ`.

### 2.10 Offline behaviour

| When | What works offline |
|---|---|
| M1a | The app opens read-only from the cache, with a banner "Offline: data z 5. 10. 2026 14:32". Editing is disabled in one place (a `useCanEdit()` hook). Files open read-only if they're in the blob cache. |
| M7 | An outbox for event-log entries, tracker readings and "delivered" marks. Each has an ID generated on the client, so replaying it is harmless. |
| M8 | General queued edits, with the conflict UI from §2.3. |

The app tells the difference between being offline, Supabase being paused,
and Supabase being down, and says which one it is.

### 2.11 Installer, updates, CI, signing

* **electron-builder, NSIS target.** Installs per user (no administrator
  rights needed, which matters on family computers). The output is
  `Zazemi-Setup-${version}.exe`, the app ID is `cz.chynickylarp.zazemi`, and
  the installer registers the `zazemi://` protocol.
* **electron-updater** uses the GitHub provider, pointing at the public
  `zazemi-releases` repo. It checks at start and every 4 hours, downloads in
  the background, and shows "Restartovat a aktualizovat" (restart and
  update). Unauthenticated update checks are limited to 60 per hour per IP
  address, which is fine even with everyone on one hotspot at the farm.
* **Supabase URL and key** are baked into release builds from GitHub
  repository variables. A build without them, such as a developer build, shows
  the first-run screen, where someone can paste a connection code. Only the
  URL and the anon (or the newer "publishable") key ever ship.
* **CI** (`.github/workflows/ci.yml`) runs on every push and pull request,
  on Ubuntu: install, lint, typecheck, unit tests plus the RLS tests on
  PGlite, build, and a Playwright smoke test of the Electron app under a
  virtual display. From M1a there's also a job that starts real Supabase
  Postgres (`supabase db start`, Docker) and runs the same RLS tests against
  it.
* **Release** (`.github/workflows/release.yml`) runs on a `v*` tag, on
  `windows-latest`. It checks that the tag matches the version in
  `package.json`, runs the tests, builds the installer and attaches it to a
  Release in this repo. If the `RELEASES_TOKEN` secret exists, it also
  publishes to `zazemi-releases`, including the `latest.yml` file that
  auto-update reads. It can also be started by hand to make a test build
  without a release.
* **Database deployment** (`deploy-db.yml`) is started by hand only. It
  applies `supabase/migrations` and deploys the Edge Function to your
  project, using secrets you add in GitHub (`SUPABASE_ACCESS_TOKEN`, project
  ref, database password). You don't need to install any tools.
* **Code signing:** we have no certificate. Blocks marked `# CODE SIGNING`
  in `release.yml` and in the electron-builder config show where it plugs in
  later, for example Azure Trusted Signing (cheap, but needs an account and
  identity verification) or a classic certificate. The README explains the
  SmartScreen warning and how to get past it ("Další informace" → "Přesto
  spustit"). Downloads made by auto-update don't carry the "from the
  internet" mark, so SmartScreen normally appears only at first install.
* **Actions minutes:** a private repo on a free account gets 2,000 minutes a
  month, and Windows minutes count double. A release build takes roughly 10–15
  minutes, so 20–30 billed. Ubuntu CI takes roughly 4–6 minutes per push.
  Windows builds run only on tags or by hand.

### 2.12 Staying within the Free tier

* **Storage (1 GB):** one version per check-out session; a retention rule
  (keep everything for 30 days, then the newest 5 plus pinned versions; an
  organizer can change it); a meter in settings; a size check before every
  upload.
* **Egress (5 GB/month):** the blob cache; previews read from the cache;
  thumbnails are generated locally.
* **7-day pause:** detected and explained.
* **No backups:** "Záloha" exports everything to a `.zip`. Personal data is
  excluded unless ticked.

---

## 3. Data model

### 3.1 Tables

IDs are UUIDs generated on the client (needed for the offline outbox). Every
table carries `team_id` and has RLS enabled. Helper functions live in a
`private` schema that the Supabase API doesn't expose. All security-definer
functions use `set search_path = ''`.

```text
teams           id, name, settings jsonb, min_app_version, created_at
people          id, team_id, display_name, user_id?, created_at, deleted_at
team_members    team_id, user_id, person_id, role (organizer|npc|player), joined_at, removed_at
invites         id, team_id, code, role, person_id?, expires_at, max_uses, use_count,
                created_by, created_at, revoked_at                                   -- organizers only

records         id, team_id, kind, world_id?, game_id?, parent_id?, title,
                data jsonb, visibility (organizers|specific|everyone),
                sort_key, tags text[], rev int,
                created_by, created_at, updated_by, updated_at, deleted_by, deleted_at
record_secrets  record_id, team_id, data jsonb, rev, updated_by, updated_at          -- organizers only
record_access   record_id, team_id, person_id? | group (npc|player)                -- for 'specific'
record_people   record_id, team_id, person_id, relation (player|actor|…)           -- rule R4
record_links    team_id, from_id, to_id, kind (mention|map|hook|…)                 -- [[links]], backlinks
record_history  id, team_id, record_id, actor, at, op, before jsonb, after jsonb    -- organizers only

-- M1b: files (a file and a folder are records too, so they share visibility and links)
file_versions   id, team_id, file_id, no, storage_path, size, sha256, mime,
                session_id, base_version_id, is_conflict, pinned, label, created_by, created_at
file_locks      file_id, team_id, user_id, display_name, machine, acquired_at, heartbeat_at
file_text       file_id, team_id, version_id, text

-- later: append-only tables, because they're logs rather than documents
ledger_entries   (M5)  who gave what to whom, when
event_log        (M7)  timestamped backstage log
tracker_readings (M7)  value of a per-game tracked field for a character, over time

-- personal data, deliberately kept out of `records`, search and exports (M6)
registrations   id, team_id, game_id, person_id, status, consent_on_file, allergies,
                emergency_contact, created_at   -- organizers + the person themselves
```

* **Worlds and games are records too** (kind `world` or `game`), because a
  game being planned is itself a secret. A record's `world_id` and `game_id`
  scope it, so the drive and every tool show World → Game.
* **`data` is checked by a zod schema per kind**, defined in
  `src/core/kinds/<kind>.ts` together with its secret part, default
  visibility, searchable fields and link extraction. Adding a kind happens in
  one place. Postgres checks only the basics (the kind is known, `data` is
  an object).
* **Links are kept up to date by a trigger** that reads mention nodes out of
  the rich-text JSON, so backlinks can't drift from the text.
* **Game cloning (M3)** is a deep copy that remaps IDs, written as a pure
  function in `src/core`. Because almost everything is a record, it covers
  later kinds automatically.

### 3.2 Record kinds by milestone

| Milestone | Kinds |
|---|---|
| M1a | `world`, `game` |
| M1b | `folder`, `file`, `doc_template` |
| M2 | `character`, `character_profile`, `sheet_template`, `npc`, `npc_appearance`, `faction` (faction, opinion group, clan, ethnic or religious group), `relationship`, `definition` (race, class, profession, skill), `phase`, `block` |
| M3 | `page` (subtypes: place, organization, off-stage person, law or decree, religion, historical event, real-history note), `canon_entry`, `history_event`, `beat` (run-of-show), `plot_thread`, `clue`, `quest`, `hook`, `issue`, `rulebook`, `rule_section`, `glossary_term` |
| M4 | `prop_document`, `writer_profile`, `form_template`, `location_sign`, `archive`, `archive_part`, `print_job`, `diary_design` |
| M5 | `item`, `currency`, `recipe`, `loot_table`, `inventory_item` (props the group owns), `map`, `map_layer`, `travel_route`, `sleeping_plan` |
| M6 | `meal`, `dish`, `ingredient`, `budget_line`, `equipment_list`, `task`, `note`, `survey` |
| M7 | `tracker_definition` (+ tables `event_log`, `tracker_readings`) |

### 3.3 Server functions by milestone

* **M1a:** `create_team`, `create_invite`, `join_team`, `visible_record_ids`, `record_readers`, `set_member_role`, `remove_member`. Edge Function: `admin-set-password`.
* **M1b:** `checkout_file`, `heartbeat_lock`, `commit_file_version`, `release_lock`, `force_release_lock`, `restore_file_version`, `prune_versions`.
* **M7:** `mark_delivered`, `append_event`, `record_reading`. All idempotent, so the outbox can replay them.

---

## 4. Technology

Every dependency is free and permissively licensed. None needs an account.

| Area | Choice | License |
|---|---|---|
| Shell | Electron (latest stable, currently 44) | MIT |
| Build | electron-vite 5 + Vite 7, TypeScript (strict) | MIT |
| Installer and updates | electron-builder (NSIS), electron-updater | MIT |
| UI | React 19, Mantine 9, Tabler icons, React Router (hash routing) | MIT |
| Rich text | TipTap (free core only, no paid extensions) | MIT |
| Tables | TanStack Table + TanStack Virtual | MIT |
| Validation | zod | MIT |
| i18n | i18next + react-i18next (handles Czech plurals: 1 soubor, 2 soubory, 5 souborů) | MIT |
| Backend client | @supabase/supabase-js; Supabase CLI as a dev dependency | MIT |
| Local cache | Dexie (IndexedDB) | Apache-2.0 |
| Search | MiniSearch | MIT |
| Files | chokidar (file watching); docx-preview; ExcelJS; pdfjs-dist; markdown-it; DOMPurify | MIT / Apache-2.0 / MPL-2.0 or Apache-2.0 |
| Output | docx, docxtemplater (core), pdf-lib | MIT |
| Graph | Cytoscape.js (relationship graph) | MIT |
| Map | Konva + react-konva | MIT |
| Tests | Vitest, Testing Library, PGlite (in-process Postgres for RLS tests), Playwright | MIT / Apache-2.0 |
| Lint and format | ESLint 9 + typescript-eslint, Prettier | MIT |

---

## 5. Repository layout

```text
src/
  main/            Electron main process: window, IPC handlers, Office, watcher, blob cache, print, updater
  preload/         contextBridge: the single typed window.zazemi API
  shared/          IPC contract (zod schemas and types) shared by main, preload and renderer
  core/            pure domain logic and record-kind schemas, no Electron or DOM
  renderer/
    app/           routes, layout, providers
    features/      one folder per area (drive, characters, lore, documents, …)
    components/    shared UI pieces
    data/          Supabase client, sync engine, Dexie cache, StorageProvider
    i18n/          cs.ts (and en.ts later)
supabase/
  config.toml
  migrations/      timestamped SQL; RLS policies live here
  functions/       admin-set-password
  seed.sql         invented demo data only
tests/
  db/              RLS tests (Vitest), run on PGlite locally and on real Supabase in CI
  e2e/             Playwright driving the Electron app
build/             icon, NSIS assets
resources/fonts/   bundled OFL fonts and their licenses (M4)
docs/              PLAN.md, SETUP.md, CHANGELOG.md, later the Czech user guide
.github/workflows/ ci.yml, release.yml, deploy-db.yml
```

---

## 6. Testing

* **Unit tests (Vitest)** cover everything in `src/core`: Czech normalisation
  and number parsing ("1,5"), shopping-list maths, the travel calculator,
  the consistency checker, game cloning, phase checklists, mail-merge, and
  the version-retention rule.
* **RLS tests** run against real Postgres: PGlite locally (fast, no
  Docker), and Supabase's own Postgres in CI. A generated matrix covers kind
  × visibility × role × attachment. Named tests prove, among other things,
  that:
  * a player can't read another player's character sheet;
  * a player can't read any organizer-only record, nor any `record_secrets`
    row;
  * an NPC actor reads their own NPC's brief and appearances, but not another
    NPC's;
  * someone outside the team reads nothing;
  * a player can't download the storage object of a file they can't see;
  * a player can't change their own role or join with an expired code;
  * only organizers read history and invites;
  * `visible_record_ids` returns exactly what RLS returns for that person.
* **End-to-end tests (Playwright + Electron)** run on Linux under Xvfb in
  CI. Office is simulated by a test-only opener that edits the file and
  creates and removes a `~$` lock file. It exists only in test builds, never
  in the shipped app. From M1a, the end-to-end job runs against a local
  Supabase stack.
* **Manual tests on Windows:** every milestone ends with a short checklist
  for you, because real Office, SmartScreen and the installer can only be
  tried on Windows.

**Every milestone is done when:** tests pass, CI is green,
`docs/CHANGELOG.md` is updated, and you have the manual test list.

---

## 7. Milestones

Each milestone ends with a stop for your review.

### M0: Skeleton
* Repo layout, strict TypeScript, ESLint and Prettier, electron-vite.
* Electron shell with the security baseline: a window showing the first-run
  screen "Zázemí zatím není připojené" (Zázemí isn't connected yet), in
  Czech through i18n, with light/dark/system theme and Czech date and number
  helpers.
* Typed preload API skeleton (app version, update status).
* electron-builder NSIS config (`Zazemi-Setup-x.y.z.exe`, per-user install)
  and electron-updater wired to `zazemi-releases`.
* CI (`ci.yml`) and release (`release.yml`, with the signing placeholder).
* Docs: `README.md` (install, SmartScreen, honest limits), `docs/SETUP.md`
  (Supabase project, settings, GitHub variables and secrets, releases repo,
  how to cut a release), `CLAUDE.md`, `docs/CHANGELOG.md`.
* Tests: unit tests for the Czech formatting helpers, and an end-to-end
  smoke test (the window opens and shows the first-run screen).
* **Done when:** CI is green, and a `v0.0.1` tag produces
  `Zazemi-Setup-0.0.1.exe` on a GitHub Release.

### M1a: Accounts, secrecy and sync
* Supabase migrations: teams, people, members, invites, records, secrets,
  access, links, history, and the RLS functions. The RLS test suite.
* Sign-in, sign-up, team creation, invite codes and `zazemi://` links,
  roles, member management, organizer-set temporary passwords.
* World → Game structure (create, rename, visibility).
* Sync engine, the local cache, read-only offline mode, the "paused project"
  message.
* "Kdo to vidí?" panel and the visibility editor (organizers / specific
  people or groups / everyone).
* The Ctrl+K command palette (navigation only, for now).
* "Záloha": export records as JSON.

### M1b: The drive and Office
* Folder tree per world and game, plus "Sdíleno se mnou". Drag-and-drop
  upload of files **and whole folders**, keeping structure. Rename, move,
  trash and restore.
* Previews (§2.7). Search by name and by text content.
* Open in Office with check-out and check-in, read-only copies, stale locks
  and force-release, conflict versions, the startup scan, the "Rozpracované
  soubory" panel.
* Version history with restore and pin, version squashing, the retention
  rule, the storage meter.
* "Nový ze šablony" (new from template): Word or Excel templates with simple
  fields (world, game, date). Fields from characters arrive in M2 and M4.
* "Záloha" also includes files.

### M2: Characters
* Character sheets with configurable sections per game (each section's
  audience: the player or organizers only), sheet templates, the
  out-of-game warning header.
* Roster view: character, player, role, faction, house number, sheet status,
  costume status.
* Factions and groups (customs, beliefs, laws, vocabulary, members,
  visibility), with multiple membership.
* Relationships and the relationship graph (labels, notes, one-sided
  secrecy, a warning for characters with too few ties).
* NPCs: a lighter sheet with the actor; bulk creation (30 soldiers with
  ranks) and a compact list.
* Phases and blocks (basic). The NPC schedule as a table and as a timeline
  per actor, with clash detection.
* Definitions per world: races, classes, professions, skills.
* "Zobrazit jako hráč" (view as player).

### M3: Lore and time
* Wiki pages and entity subtypes, `[[links]]` with autocomplete, backlinks,
  tags, Czech-aware full-text search.
* Canon registry, open issues, consistency checker (scope as in §1).
* In-world history timeline (relative dates) and the run-of-show built from
  phases, blocks and beats. A per-phase auto-generated checklist.
* Plot threads with clues and where each clue lives; "threads with no
  reachable clue".
* Quests and job board (resolution stored as organizer-only), player hooks
  per character.
* Rulebook editor: sections, glossary, versions, "what changed since v1",
  organizer-only mechanics notes, and a separate safety and code-of-conduct
  section.
* Clone a game as a sequel.

### M4: Prop documents and printing
* Document records with all the brief's fields; numbering; status workflow.
* Writer profiles with bundled OFL fonts (handwriting, typewriter,
  blackletter), and the Czech-glyph check.
* Print-ready PDF and DOCX, A4 and A5, with the grey organizer strip to cut
  off. Batch export by phase or by player, in delivery order.
* Mail-merge forms (census slip, name lists) filled from the roster.
* Location signs as cards; character diary booklets (front and back designs,
  A5 booklet page order on A4); player rulebook PDF.
* Archive builder: shelf marks, a generated inventory, an organizer guide,
  and supplements that don't renumber printed pages.
* Print queue (paper, copies, status).
* Template fields from characters (§M1b).

### M5: Items, economy and maps
* Item catalogue with every field in the brief; currency with a sub-unit;
  a price multiplier per phase.
* Ownership ledger and transfer log; recipes and crafting conversions; loot
  tables and forest finds; printable item cards and ration coupons; the
  group's prop inventory across games.
* Map editor (Konva): import an image or start blank; markers, zones, paths,
  rope lines, gates, numbered buildings, labels, scale bar, compass; layers
  with their own visibility; links from objects to places, signs, items and
  clues; site maps and in-world maps; PNG and PDF export at A4 and A3.
* Distance table and travel calculator with modifiers from the item
  catalogue.
* Sleeping plan with capacity checks and rules that change it mid-game.

### M6: Logistics
* Menu → dishes → ingredients; consolidated shopping list for a given
  headcount, grouped by shop, with price per head and total; allergy flags
  from registrations; meals tied to phases.
* Budget (planned against actual, cost per head, `.xlsx` export).
* Equipment lists, NPC costume list.
* Tasks and notes.
* Registrations: Google Forms CSV import, status, parental consent for
  under-18s, emergency contact. Organizer-only, minimal, deletable, never in
  exports by default.
* Feedback: import a post-game survey as a retrospective.

### M7: Live game
* Big-button dashboard: current phase and block, "next up", one-click
  "doručeno" (delivered).
* Event log, per-character status tracker with fields defined per game
  (wounds, blood loss, infection, drunkenness…), quick lookup.
* Offline outbox (§2.10) and a clear online/offline indicator.

### M8: Import and polish
* Google Drive importer: `.zip` and multi-part Takeout, duplicate names,
  skipped Forms, an import report.
* Queued offline edits with conflict resolution; restoring from a backup.
* Onboarding tour; user guide in Czech; a final round of 1366×768 and
  keyboard checks.

---

## 8. Risks and open questions

**Questions for you:**

1. **When is your next game?** If it comes before roughly M5, I'd pull
   forward printing (M4) and the live dashboard's offline core (M7) and push
   maps and logistics later.
2. **Who should "Všichni" (everyone) mean?** I've assumed every team member.
   The alternative is the participants of that game. With "every member", a
   person who only played game A would also see a public announcement of
   game B.
3. **Should players be able to edit anything in v1?** For example their own
   costume notes or "what I'm bringing". The plan assumes not (§1, item 8).
4. **Is `kristator/zazemi-releases` the right name** for the public releases
   repo?

**Risks:**

| Risk | Mitigation |
|---|---|
| I can't run Windows or Office in the sandbox | Release builds happen on a Windows runner in CI; Office is simulated in end-to-end tests; a manual checklist on Windows ends each milestone. |
| Office lock-file behaviour differs between versions | Detect any `~$*` or `.~lock.*#` file in the per-file folder; the "Hotovo" button always works; locks expire. |
| The Free tier fills up | Version squashing, retention, the meter, and moving to Pro without code changes. |
| A secrecy mistake leaks a plot | One access function, row-level rules only, a test matrix in CI against real Supabase Postgres, and the "Kdo to vidí?" panel so organizers can check. |
| The unsigned installer scares players | README steps, and a code-signing slot ready in CI. |
| Players run different app versions | Backward-compatible migrations and `min_app_version`. |
