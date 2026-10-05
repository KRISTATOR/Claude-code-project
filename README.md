# Zázemí

The organizers' backstage for **Chýnický LARP**: a Windows desktop app with a
shared drive that opens files in the real Microsoft Office apps, plus LARP
planning tools (characters, lore, timeline, prop documents, items, maps,
logistics, live-game dashboard).

> **Status: Milestone 1b.** Accounts, teams and invites, the secrecy model,
> offline read-only mode, and the shared drive with Office check-out, versions,
> previews and search. The LARP tools arrive in later milestones (see
> [`docs/PLAN.md`](docs/PLAN.md) and [`docs/CHANGELOG.md`](docs/CHANGELOG.md)).

* **Plan, architecture, milestones:** [`docs/PLAN.md`](docs/PLAN.md)
* **One-time setup (Supabase, GitHub):** [`docs/SETUP.md`](docs/SETUP.md)
* **What changed:** [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
* **Working on the code:** [`CLAUDE.md`](CLAUDE.md)

## Installing (Windows 10 or 11)

1. Download `Zazemi-Setup-x.y.z.exe` from the **Releases** page of
   `kristator/zazemi-releases` (or ask an organizer for the file).
2. Run it. It installs for your Windows user only, so it doesn't need
   administrator rights. Shortcuts appear on the desktop and in the Start menu.
3. **Windows will probably warn you** (see below). That's expected.
4. From then on the app updates itself: when a new version has downloaded, a
   green bar offers "Restartovat a aktualizovat".

### The SmartScreen warning

The installer isn't signed with a code-signing certificate yet (they cost
money every year), so Windows Defender SmartScreen shows a blue window saying
"Windows protected your PC" when you run it for the first time. To continue:

1. Click **More info** (in Czech Windows: **Další informace**).
2. Check that the app is `Zazemi-Setup-….exe`; the publisher will say
   *Unknown publisher* (*Neznámý vydavatel*).
3. Click **Run anyway** (**Přesto spustit**).

If your browser blocks the download itself, choose "Keep" / "Ponechat" in the
browser's download list. Updates installed by the app normally don't trigger
the warning again.

**For players (in Czech, to forward as-is):**

> Windows při prvním spuštění instalátoru nejspíš ukáže modré okno „Systém
> Windows ochránil váš počítač“. Je to proto, že aplikace zatím nemá placený
> podpis. Klikněte na **Další informace** a pak na **Přesto spustit**.
> Instalace nepotřebuje práva správce. Aplikace se pak aktualizuje sama.

## What it does, and what it honestly doesn't

* **Check-out, not co-authoring.** When you open a Word, Excel or PowerPoint
  file from Zázemí, it's checked out to you: others see "Kvido upravuje tento
  soubor" and can open a read-only copy. Your saves go back to everyone as a
  new version. **Two people can't type in the same document at the same
  time.** That needs the files to live in OneDrive/SharePoint, which is why
  file storage sits behind a replaceable `StorageProvider`. A Microsoft 365
  provider can be added later without changing the rest of the app.
* **Secrecy is enforced by the server**, not by the app hiding things. A
  player's computer only ever receives what that player may see.
* **Organizers' computers hold every secret in a local cache** (so the app
  works offline at the farm). Turn on Windows device encryption or BitLocker
  on organizer laptops.
* **No telemetry or analytics.** The app talks only to our own Supabase
  project and, for updates, to GitHub.

## Development quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # run the app with hot reload
npm test             # unit tests
npm run lint && npm run typecheck
npm run build:test && npm run test:e2e   # on Linux: xvfb-run -a npm run test:e2e
```

Releases are built by GitHub Actions on Windows when a `v*` tag is pushed;
see [`docs/SETUP.md`](docs/SETUP.md#5-cutting-a-release).

## Code signing (later)

Code signing slots in at the blocks marked `CODE SIGNING` in
`electron-builder.yml` and `.github/workflows/release.yml`. Options, all
paid and needing an account or identity check: Azure Trusted Signing (a few
euros a month), or a classic OV code-signing certificate. Signing removes
the SmartScreen warning once the certificate has built up reputation.
