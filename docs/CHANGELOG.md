# Changelog

All notable changes to Zázemí. Versions follow [semver](https://semver.org/);
each milestone ends with a release.

## 0.8.0: Milestone 7, live game (2026-10-05)

Database: new `event_log` and `tracker_readings` tables (migration
`20261009090000`), with RLS and the server functions `append_event`,
`record_reading` and `mark_delivered`. Expand-only.

### Added
- **Živá hra:** the big-button dashboard for the backstage tent. It shows
  the current phase and block with the time they started, and has buttons
  to start the next phase or block (or jump to any). "Na řadě" lists what
  is still left in the current phase and block: run-of-show beats, NPC
  appearances and documents to deliver, in delivery order. One click on
  "Doručeno" / "Hotovo" marks one done and logs it.
- **Deník:** the backstage event log, with notes and incidents (Ctrl+Enter
  writes). It also records phase changes and deliveries automatically.
  Organizers and NPC actors see it; players never do.
- **Stav postav:** status fields defined per game (wounds, blood loss,
  infection, drunkenness…). Each is a number with limits, named levels or
  yes/no, and can apply to characters, NPCs or both. Values have big +/−
  buttons, notes, a warning colour at a threshold and a history per
  character. Search by character or player name.
- **Offline outbox:** log entries, tracker values and "doručeno" work
  without a connection. They show at once, wait in a queue and go out when
  the connection returns. Sending twice is harmless. The header shows how
  many are waiting, and lets you retry or discard any the server refused.
  The sync badge switches to "Offline" as soon as the network drops.

## 0.7.0: Milestone 6, logistics (2026-10-05)

Database: a new `registrations` table (migration `20261008090000`), with RLS
and the server function `update_my_registration`. Expand-only, so 0.6.0 keeps
working.

### Added
- **Přihlášky:** registrations per game, kept apart from all other records
  because they are personal data. Only organizers see them all; each person
  sees only their own. Import from a Google Forms CSV with a column mapping
  that is guessed from the headers; only name, age (worked out from a birth
  date, an age or a yes/no answer), allergies, emergency contact and a note
  are stored. E-mails and timestamps are never read. People are matched to
  the roster by name, existing registrations are skipped, and a repeated
  answer replaces the earlier one. Status (přihlášen/a, potvrzeno,
  zaplaceno, má postavu, zrušeno), the assigned character, under-18s with a
  warning until the parents' consent is on file. Deleting is permanent.
- **Moje přihláška:** players and NPC actors see their own registration and
  can correct their allergies and emergency contact (through a server
  function; they can't change anything else). A link to what they should
  bring.
- **Jídlo:** ingredients (unit, shop, price, package size, the 14 EU
  allergens, meat or animal products), dishes per portion (g, kg, dl, l,
  ks… converted automatically), and the menu by day and slot, tied to a
  phase if wanted, with alternatives for part of the table. Each meal warns
  about people who would have nothing to eat because of their allergies or
  diet. The shopping list for any headcount (registrations by default) is
  grouped by shop, rounded up to whole packages, with total and price per
  head, and exports to `.xlsx`.
- **Rozpočet:** income and expenses by category, planned against actual,
  balance, cost per head, the food estimate from the menu, and `.xlsx`
  export with live formulas.
- **Vybavení:** lists of what players bring, what the group provides,
  kitchen gear at the venue and NPC costumes (who wears what), with a
  missing, have or packed state. A list shared with players appears in their
  app.
- **Úkolníček:** tasks per game with assignee, due date (overdue ones in
  red), status and a link to any record.
- **Poznámky:** simple rich-text notes per game or for the whole team.
- **Zpětná vazba:** a post-game survey CSV becomes a retrospective. Name,
  e-mail and phone columns are unticked by default. Scales show the average,
  repeated answers show counts, and free text is listed; organizers add
  their conclusions.

### Changed
- **Záloha** leaves registrations out unless "Včetně přihlášek" is ticked.

## 0.6.0: Milestone 5, items, economy and maps (2026-10-05)

No database changes.

### Added
- **Předměty a peníze:** the item catalogue (category, price and buy-back
  price, effect, condition or upkeep, availability by phase, trade regime –
  free, rationed, banned, black market only – requisitionable, starting
  owner and count, card or real prop, travel speed for mounts and carts,
  organizer notes). Prices shown for any phase.
- **Money:** the game's currency with Czech forms (1 orel, 2 orly, 5 orlů), a
  sub-unit (1 orel 5 grošů) and a price multiplier per phase.
- **Majetek:** the ownership ledger. Holdings come from the starting owners
  plus every transfer, in time order; a transfer from someone who does not
  have enough is flagged. The character sheet's "Majetek" section shows what
  the character holds.
- **Item cards and ration coupons** printed eight to an A4 sheet.
- **Recepty:** potions, crafting conversions ("100 ml mléka → 20 g sýra za 1
  orla") and plants, with ingredients, result, cost, verification steps and
  properties.
- **Nálezy:** loot tables and forest finds per place (item, how it is found,
  tracks).
- **Sklad rekvizit:** the group's own props across all games (count,
  storage place, condition).
- **Mapy:** a map editor for the venue and in-world maps: markers with
  icons, zones, paths, rope lines, gates, numbered buildings, labels, a scale
  bar and a compass, on a blank canvas or a scan from the drive. Layers have
  their own visibility, so a secret layer stays with organizers while players
  see a clean map. Map objects link to wiki places, location signs, items
  and clues. Export to PNG and to PDF at A4 or A3.
- **Cesty:** walking times between off-site places, a distance table and a
  travel calculator that finds the quickest route and applies mounts and
  vehicles from the catalogue (horse ×3, mule ×2, ox ×1,5, cart ×0,75).
- **Spaní:** the sleeping plan with capacity checks and moves from a given
  phase on (and the in-game rules that cause them).

## 0.5.0: Milestone 4, prop documents and printing (2026-10-05)

No database changes.

### Added
- **Dokumenty:** in-game documents with number (the next one is suggested;
  duplicates are flagged), type (letter, notice, speech, form, list,
  newspaper, leaflet, photo caption, sign), phase, writer, in-world author
  and recipient, the characters whose players get it, delivery method and
  order, in-world date, A4 or A5, copies, status (draft, final, printed,
  delivered), the text with [[links]] and organizer-only notes. A live
  paper preview shows the writer's look.
- **Pisatelé:** writer profiles per world (font, ink, paper, size,
  letterhead, signature). Bundled open-licence fonts: handwriting (Caveat,
  Marck Script), typewriter (Courier Prime, Special Elite), blackletter
  (Grenze Gotisch) and a book face (EB Garamond). A build test refuses any
  font that cannot write every Czech letter. "Uložit písma do složky" exports
  them for installing on computers that open the Word files.
- **Print and export:** PDF (rendered in a hidden window with scripts off)
  and Word. Each document starts on its own page, A4 and A5 mixed in one
  file, with a grey organizer strip (number, phase, for whom, how to
  deliver) to cut off. Batch export "everything for phase III" or
  "everything for this player", in delivery order. Print preview inside the
  app.
- **Formuláře:** mail-merge forms filled from the roster: one copy per
  character (a census slip) or a list with chosen columns; fields {jmeno},
  {hrac}, {funkce}, {dum}, {skupiny}, {rasa}, {dovednosti}, {tym}, {svet},
  {hra}, {datum}; optionally only some groups.
- **Cedule:** location signs linked to a wiki place, printed as cards four
  to an A4 sheet with cut lines, or as A5/A4.
- **Deník postavy:** a diary booklet per character (front page, chosen sheet
  sections – never organizer-only ones – lined pages, back page), printed as
  A5 booklets imposed two per A4 side for double-sided printing.
- **Archiv:** archives bound from documents, PDFs from the drive and texts,
  with shelf marks (I/1, IV/7), a generated inventory, page numbers, an
  organizer guide (page ranges and purpose), and supplements that continue
  the numbering without renumbering pages already printed.
- **Tisková fronta:** print jobs with paper, copies, phase and status; a
  list of finished documents waiting to be printed; "Vytištěno" marks the
  documents as printed.
- Player rulebook PDF (chapters, safety, glossary; never the mechanics
  notes) and quest notices for the job board (A5).
- Word and Excel templates in the drive can be filled for a chosen
  character.
- The consistency checker flags references to numbered documents that do
  not exist ("viz dopis č. 40").

## 0.4.0: Milestone 3, lore and time (2026-10-05)

**Database changes: run "Deploy database" (docs/SETUP.md, step 6) before
installing this version.** It adds the trigger that keeps backlinks.

### Added
- **Rich text with [[links]]:** wiki pages, history, plot summaries and rule
  sections use a rich-text editor (headings, lists, quotes). Typing `[[`
  offers characters, places, groups, NPCs, threads and rules to link; links
  follow renames and show struck through when the target is gone. A database
  trigger keeps backlinks in step with the text.
- **Encyklopedie:** pages for places, organizations, people off stage, laws,
  religions and historical events, per world or per game, with tags, a
  summary, organizer-only notes, "Odkazuje sem" (backlinks) and visibility.
- **Kánon:** a registry of facts (house numbers, ages, titles, dates…).
- **Kontrola:** the consistency checker finds the same name twice,
  confusable names ("Lipnov" / "Lipnice"), links to deleted or trashed
  records, characters that differ from the canon, and two canon values for
  one fact. Findings can be hidden or turned into an open question. Prose
  contradictions are out of scope (see PLAN §1.9).
- **Otevřené otázky:** issues with priority, status, who is on it and the
  records they concern.
- **Dějiny:** an in-world timeline dated relative to the game ("před 120
  lety"), with the world's own date labels.
- **Průběh hry:** the run-of-show by phase and block, with beats (scenes,
  announcements, logistics) and the NPC appearances of each block, and a
  **checklist per phase** generated from NPC preparation, beats, clues to
  place and quests to post, plus hand-written tasks. Ticking an item updates
  the record it comes from.
- **Zápletky:** plot threads with organizer-only resolutions, clues and where
  each one lives (who holds it or where it is), and a warning for threads no
  reachable clue leads to. **Háčky:** personal hooks per character, which can
  be shown to that character's player on their sheet.
- **Úkoly a nástěnka:** quests and job offers with giver, reward and phase;
  the resolution is organizer-only, and players never see drafts.
- **Pravidla:** a rulebook with ordered chapters, a separate safety and code
  of conduct tab, a glossary, organizer-only mechanics notes per chapter,
  published versions ("v1") and "what changed since v1" as a word diff.
- **Klonovat jako pokračování:** copies a game with everything in it under
  new ids, remapping every reference (relationships, clue holders, links in
  text…). Files stay with the original game.
- Search understands Czech word endings ("hraběnkami" finds "hraběnka")
  and indexes rich text.
- RLS tests for all new kinds, hooks shared through their character, and
  backlinks (a link is visible only when both ends are).

### Changed
- The story pages sit in a collapsible "Příběh" group in the navigation.

## 0.3.0: Milestone 2, characters (2026-10-05)

No database changes: everything new is a record kind on the existing schema.

### Added
- **Current game** switcher in the sidebar; the new section "Hra" groups the
  tools that work on one game. The choice is remembered per team.
- **Characters** ("Postavy"): roster with player, function, groups and house
  number, sorted by house; sheet and costume status editable in the table;
  a warning dot for characters with too few relationships.
- **Character sheet** built from the game's sheet template ("Šablona listu"):
  sections can be added, renamed, reordered and given an audience: the
  player, organizers only, or everyone. Organizer-only parts are stored in the
  organizer-only table; public parts go into a separate public profile record.
  The out-of-game warning header ("Neherní materiál – nesdílet") is
  configurable. Ctrl+S saves.
- **Groups** ("Skupiny"): factions, opinion groups, clans, nations and
  religions per game or for the whole world, with customs, beliefs, laws,
  vocabulary, organizer notes and members (a character can be in several).
  Customs and vocabulary appear on members' sheets.
- **Relationships** ("Vztahy"): a graph and a list; each relationship says
  who knows about it (both sides, or only one). A player sees exactly the
  relationships their side knows of; the other side's player does not.
- **NPCs** ("CP"): a light sheet with rank, description, abilities, costume
  and actors; bulk creation ("Voják {1-30}; vojín"); appearances with
  situation, stats, actor, block, scene, time and preparation status. An
  actor can read the appearances they play, not the rest of the NPC.
- **NPC schedule** ("Harmonogram CP"): the table of all appearances and a
  timeline per actor; overlapping appearances of one actor are flagged.
- **Phases and blocks** (basic; the run-of-show follows in M3).
- **Races, classes, professions and skills** per world ("Rasy a
  dovednosti"), selectable on sheets.
- **View as player** ("Zobrazit jako…" in Lidé, or on a character sheet):
  the whole app shows exactly what that person can read, read-only, with a
  banner. The list comes from the server's access rule, not from the client.
- RLS tests for every new record kind (four checks each).

### Fixed
- A record that became visible without being edited (for example a
  character after its player was attached) did not reach that person's
  computer. The app now fetches newly visible records when someone's access
  changes and on every reconcile.

### Changed
- Players no longer see the NPC pages in the navigation.

## 0.2.0: Milestone 1b, the shared drive and Office (2026-10-05)

**Database changes: run "Deploy database" (docs/SETUP.md, step 6) before
installing this version.** It creates the private `files` Storage bucket.

### Added
- **Disk:** folders per team ("Společné"), world and game; upload files or
  whole folders (the structure is kept), drag and drop, rename, move (folders
  move with their contents), trash and restore, permanent delete.
  "Sdíleno se mnou" lists files someone shared whose folder you cannot see.
- **Previews** inside the app: Word (rendered to HTML), Excel (tables per
  sheet), PDF (pages), images, plain text and Markdown (sanitized). PowerPoint
  shows its embedded preview picture and the slide text.
- **Open in Office with check-out:** the file is downloaded to its own
  working folder and opened in the app registered for it (Word, Excel,
  PowerPoint…). While it is open, others see "Upravuje Kvido" and can open a
  read-only copy. Every save is uploaded; within one session it replaces the
  session's version, so 30 × Ctrl+S is still one version ("Uložit jako verzi"
  keeps an intermediate state). The lock is released when the Office lock file
  disappears or on "Hotovo". Locks are refreshed every minute and expire after
  10 minutes; any organizer can release a stale lock. A save after losing the
  lock becomes a **conflict version**: nothing is overwritten. Sessions survive
  a crash or restart.
- **Version history** with who and when, open any version read-only, restore
  (creates a new version), pin (never pruned).
- **Search** (page "Hledání"): names and the text inside Word, Excel,
  PowerPoint, PDF, text and Markdown files; ignores diacritics and matches word
  beginnings ("Lipnov" finds "Lipnově"); works offline.
- **New from template:** mark a Word or Excel file as a template; new files
  from it fill {tym}, {svet}, {hra}, {datum}, {slozka}.
- **Storage meter** in Settings with warnings at 70 % and 90 % of the Free
  tier's 1 GB, and "Uklidit staré verze" (keep 30 days, then the newest 5,
  plus pinned). Shows the size of this computer's file cache.
- **Backup** is now a .zip: all records and the current version of every file.
- Downloaded versions are cached on disk by content hash (each version is
  downloaded once per computer); the cache stays under 2 GB.
- Storage policies follow the file record's visibility through the same
  access rule as everything else; 13 more RLS tests, including uploads into
  other teams and conflict handling.
- The local development stack now includes Supabase Storage, built from
  source.

### Fixed
- Locks and file text were fetched by the sync engine but not stored.

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
