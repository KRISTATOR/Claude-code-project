# Setup: what the owner does by hand

Claude can't create accounts, projects or secrets for you. These are the
one-time steps. Each says which milestone first needs it, so you can do them
in order as we go.

| Step | Needed from | Takes |
|---|---|---|
| 1. Public releases repo | M0 (auto-update) | 2 min |
| 2. Token so CI can publish there | M0 (auto-update) | 5 min |
| 3. Supabase project | M1a | 10 min |
| 4. Connect the app builds to Supabase | M1a | 3 min |
| 5. Cutting a release | every milestone | 2 min |
| 6. Deploying the database | M1a, then after schema changes | 10 min once, 1 min after |
| 7. The first organizer account | M1a | 2 min |

---

## 1. Create the public releases repo

Players download the installer from here, and the app checks here for
updates. It holds **only installers**, never code or game content.

1. Go to <https://github.com/new>.
2. Owner: **kristator**. Repository name: **`zazemi-releases`**.
3. Visibility: **Public**.
4. Tick **Add a README file** (a release needs at least one commit to attach
   to).
5. Click **Create repository**.

## 2. Create a token that lets CI publish installers there

1. Go to <https://github.com/settings/personal-access-tokens/new>
   (Settings → Developer settings → Personal access tokens → **Fine-grained
   tokens** → Generate new token).
2. Token name: `zazemi-release-publisher`. Expiration: **1 year** (put a
   reminder in your calendar to renew it).
3. Resource owner: **kristator**.
4. Repository access: **Only select repositories** → `zazemi-releases`.
5. Permissions → Repository permissions → **Contents: Read and write**.
   Leave everything else as "No access".
6. Click **Generate token** and copy it (it's shown only once).
7. Open this (private) repo on GitHub → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**.
8. Name: **`RELEASES_TOKEN`**. Secret: paste the token. Click **Add secret**.

Without this secret, releases still build and appear in this private repo,
but auto-update won't see them, and players can't download them.

## 3. Create the Supabase project (needed from M1a)

1. Sign up or sign in at <https://supabase.com/dashboard>. The free plan is
   enough to start.
2. **New project**:
   * Organization: create one, e.g. "Chýnický LARP" (Free plan).
   * Project name: `zazemi`.
   * Database password: click **Generate a password** and save it in your
     password manager. You'll need it for database deployments.
   * Region: **Central EU (Frankfurt)**.
3. Wait until the project is ready (about 2 minutes).
4. **Authentication** → **Sign In / Providers** → **Email**:
   * keep **Email** enabled;
   * switch **Confirm email** **off**. Supabase's built-in email only reaches
     members of your Supabase organization, so confirmation emails would never
     reach players. Access to team data still requires an invite code.
   * Save.
5. Check the Free plan limits on <https://supabase.com/pricing> (I couldn't
   reach that page from the development sandbox; `docs/PLAN.md` §0 lists the
   figures I worked from). Tell me if they differ.

**Never copy the `service_role` key or any `sb_secret_…` key** into the app,
this repo, a GitHub variable or a chat. The app refuses such keys anyway.

## 4. Connect the app builds to Supabase (needed from M1a)

1. In the Supabase dashboard, open **Project Settings** → **API** (or
   **Data API** / **API Keys**, depending on the dashboard version).
2. Copy the **Project URL** (`https://xxxxxxxx.supabase.co`).
3. Copy the **anon** key or the newer **publishable** key
   (`sb_publishable_…`). Not the secret or service_role one.
4. In this GitHub repo: **Settings** → **Secrets and variables** →
   **Actions** → **Variables** tab → **New repository variable**, twice:
   * `ZAZEMI_SUPABASE_URL` = the Project URL;
   * `ZAZEMI_SUPABASE_ANON_KEY` = the anon/publishable key.

   These are *variables*, not secrets, on purpose: both values end up inside
   the public installer anyway, and row-level security is what protects the
   data.

Release builds made after this step connect automatically. Builds without
these variables show the first-run screen, where someone can paste a
connection code instead.

Step 6 applies the database schema; the app shows errors until it is done.

## 5. Cutting a release

Claude bumps the version in `package.json` at the end of each milestone.
To publish it:

1. On GitHub, open this repo → **Releases** → **Draft a new release**.
2. **Choose a tag** → type the version with a `v`, e.g. `v0.1.0`, and pick
   **Create new tag on publish**. Target: the branch Claude says the
   milestone is on.
3. Click **Publish release**.
4. Watch **Actions** → **Release**. It takes about 5 minutes. It runs all
   the tests on Windows, builds `Zazemi-Setup-0.1.0.exe`, attaches it to the
   release, and (with step 2 done) publishes it to `zazemi-releases`.

From a terminal it's the same as: `git tag v0.1.0 && git push origin v0.1.0`.

If the tag doesn't match the version in `package.json`, the workflow stops
with an explanation.

### Test build without a release

**Actions** → **Release** → **Run workflow** builds the installer and
attaches it to the workflow run as a downloadable artifact, without creating
a release.

### GitHub Actions minutes

A private repo on a free GitHub account gets 2,000 Actions minutes a month,
and Windows minutes count double. A release uses about 10 billed minutes; the
Linux checks on each push use about 5. That's comfortable at our pace.

## 6. Deploying the database

The tables, security rules and the one Edge Function live in this repo
(`supabase/`). A GitHub workflow copies them to your Supabase project. It runs
only when you start it, so schema changes are always deliberate.

**Once:**

1. In Supabase, open your avatar → **Account preferences** → **Access Tokens**
   (<https://supabase.com/dashboard/account/tokens>) → **Generate new token**.
   Name it `zazemi-deploy` and copy it.
2. In this GitHub repo → **Settings** → **Secrets and variables** → **Actions**:
   * **Secrets** tab → **New repository secret** → `SUPABASE_ACCESS_TOKEN` = the token;
   * **Secrets** tab → **New repository secret** → `SUPABASE_DB_PASSWORD` = the
     database password from step 3;
   * **Variables** tab → **New repository variable** → `SUPABASE_PROJECT_REF` =
     the project's reference ID: the `xxxxxxxx` part of
     `https://xxxxxxxx.supabase.co` (also shown in Project Settings → General).

**Each time Claude says the database changed** (the changelog says so too):

1. **Actions** → **Deploy database** → **Run workflow**. Tick *Only show
   what would change* first if you want to look before applying.
2. Wait for the green tick (about a minute).

Deploy the database **before** installing a new app version that needs it.
Migrations are written so that the previous app version keeps working.

## 7. The first organizer account

1. Install and open the app. If the release was built after step 4, it
   connects automatically; otherwise paste the connection code (below).
2. **Nový účet** → your e-mail and a password (at least 8 characters).
3. Type your name, then under **Zakládám tým** the team name, e.g.
   *Chýnický LARP* → **Založit tým**. You are its first organizer.
4. Invite the others: **Lidé** → **Pozvánky** → choose the role → **Vytvořit
   pozvánku**, and send them the code. A code works once by default; for a
   group of players, raise *Počet použití*.

**Connection code** (only needed for builds without step 4): it is
`zazemi1:` followed by the URL and key, encoded. Organizers can generate it
once the app has a settings screen for it; until then, use the manual entry
("Zadat adresu a klíč ručně") on the first screen.

**Forgotten passwords:** an organizer opens **Lidé** → **Členové**, clicks
the key icon next to the person and sets a temporary password. (This uses the
`admin-set-password` Edge Function from step 6.)
