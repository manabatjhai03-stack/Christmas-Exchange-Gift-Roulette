# Christmas Exchange Gift Roulette

A private Secret Santa website for a Christmas outing. Guests sign in on their phones with a one-time-style access code. The organizer manages the guest list and starts the draw from an admin dashboard. Assignments are created on the server, stored in PostgreSQL, and never sent to anyone except the authenticated giver.

## What is implemented

- Participant login with hashed access codes and HTTP-only session cookies
- Admin login with hashed passwords and protected API routes
- Duplicate display names allowed; every guest has a unique ID
- Attendance: **Confirmed**, **Tentative**, **Not attending**
- Tentative guests stay in the database but are excluded from the draw
- Server-side derangement (no self-gifts, one recipient each) inside a database transaction
- Draw lock after finalization; reset requires typing `RESET DRAW`
- Roulette spin is visual only; the name comes from the saved assignment
- Christmas-themed, mobile-first UI for guests and a dashboard for the organizer
- CSRF token header, rate limits on login, Helmet security headers
- Row Level Security deny-all policies on Supabase tables (the Node app uses the database password, not a public anon key)

## What you must configure

This app needs a real Supabase PostgreSQL database. It will not store assignments in the browser.

Never put `DATABASE_URL`, `SESSION_SECRET`, `ACCESS_CODE_PEPPER`, or a Supabase **service role** key in `public/` or GitHub.

## 1. Install Node.js

1. Download the LTS installer from [https://nodejs.org](https://nodejs.org).
2. Install it (include npm).
3. Open **Visual Studio Code**.
4. Terminal → New Terminal and check:

```bash
node -v
npm -v
```

You need Node 18 or newer.

## 2. Open this project

In VS Code: **File → Open Folder** and choose `christmas-roulette`.

## 3. Create a Supabase database

1. Create a project at [https://supabase.com](https://supabase.com).
2. Wait until the database is ready.
3. Open **SQL Editor**.
4. Paste the full contents of `database/schema.sql` and run it.
5. Open **Project Settings → Database**.
6. Copy the connection URI (URI format). On Render, the **transaction pooler** URI (port `6543`) is usually the most reliable.

The schema creates:

- `admins`
- `events` (one default Christmas event)
- `participants`
- `participant_credentials`
- `assignments` (no self-assignment, unique giver, unique recipient)
- `session` (server-side cookies)

RLS is enabled with deny-all policies so the public Supabase API cannot read pairings.

## 4. Install packages

```bash
npm install
```

## 5. Environment variables

```bash
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env`.

Edit `.env` (never commit this file):

```
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://...your supabase uri...
SESSION_SECRET=paste-a-long-random-string
ACCESS_CODE_PEPPER=paste-another-long-random-string
ADMIN_SETUP_TOKEN=
TRUST_PROXY=0
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run that twice — once for `SESSION_SECRET`, once for `ACCESS_CODE_PEPPER`.

## 6. Run locally

```bash
npm start
```

Open:

- Guests: [http://localhost:3000](http://localhost:3000)
- Organizer: [http://localhost:3000/admin](http://localhost:3000/admin)

## 7. Create the first admin

In the VS Code terminal (use your own email and a password of 12+ characters):

```bash
node scripts/create-admin.js you@email.com "choose-a-long-password"
```

Then sign in at `/admin`.

Optional alternative: set `ADMIN_SETUP_TOKEN` in `.env` before any admin exists, then `POST /api/admin/setup` with `{ "setupToken", "email", "password" }`. Leave the token empty after the first admin exists.

## 8. Add the guest list

Seed the 18 names from the outing (two people named Dave’s Friend, three tentative guests):

```bash
npm run seed
```

This writes **plaintext access codes** to `access-codes.txt` in the project folder. That file is gitignored. Share each code privately (chat, paper, not a group screenshot of the whole list).

You can also add or edit people in the dashboard, including tentative guests, without making them confirm yet.

## 9. Test before the real party

Do this on a computer and two phones if you can.

1. Sign in as admin. Confirm counts: confirmed vs tentative vs not attending.
2. Search by name. Edit attendance. Add a duplicate name on purpose — it should get a new ID and a new code.
3. As a tentative guest, sign in on the phone. You should **not** see Spin.
4. Try to finalize with fewer than two confirmed guests — it should refuse.
5. Finalize with the real confirmed list. The dashboard should lock edits.
6. Sign in as a confirmed guest. Wait message should be gone. Spin. Note the recipient.
7. Refresh the phone. You must get the **same** recipient. The wheel is decoration; the name is from the database.
8. Sign in as a different guest. You must not see the first person’s recipient.
9. Change the URL, replay another guest’s request, or edit JavaScript — the API still only returns **your** assignment from the session cookie.
10. Try deleting a guest after finalization — it should refuse and tell you to reset.
11. Reset by typing `RESET DRAW`. All pairings disappear. Change attendance, then finalize again.

## 10. Put the code on GitHub (no secrets)

```bash
git add .
git status
```

Confirm `.env` and `access-codes.txt` are **not** listed.

```bash
git commit -m "Add Christmas exchange gift roulette app."
```

Create a GitHub repo (private is safer for an event site) and push. Do not upload the Supabase service role key.

## 11. Deploy on Render

1. Go to [https://render.com](https://render.com) and create a **Web Service** from the GitHub repo.
2. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
3. Environment variables (same names as `.env`):

   - `NODE_ENV` = `production`
   - `TRUST_PROXY` = `1`
   - `DATABASE_URL` = Supabase pooler URI
   - `SESSION_SECRET` = new long random value (or the same as local)
   - `ACCESS_CODE_PEPPER` = **must match** the pepper used when you hashed access codes. If you change it, every existing code stops working; regenerate codes in admin.
   - `ADMIN_SETUP_TOKEN` = leave empty if you already created an admin

4. Deploy. Render gives you an `https://…onrender.com` URL.
5. Create the admin on the **production** database if you have not already (`create-admin` against production `DATABASE_URL`, or run it once from a machine that has that `.env`).
6. If you seeded only on your laptop, either run `npm run seed` with the production `DATABASE_URL` **once**, or add guests in the live admin dashboard.

## 12. Test the live site on phones

Open the Render URL on two different phones, each with its own access code. Confirm:

- HTTPS padlock in the browser
- One phone cannot see the other recipient
- After a refresh, the assignment is unchanged

## Privacy and security notes

- Access codes and admin passwords are hashed (HMAC lookup + bcrypt).
- Sessions live in Postgres (`session` table), cookie `christmas.sid` is HTTP-only.
- Mutations require an `X-CSRF-Token` header from `GET /api/csrf`.
- Login routes are rate limited.
- Pairings are not embedded in HTML or in public API responses.
- Admin “Show pairings” is an explicit extra step.

## Troubleshooting

**`DATABASE_URL is not set`**  
You started the app without `.env`. Copy `.env.example` and restart.

**SSL / connection timeout to Supabase**  
Use the pooler URI, allow your IP (or disable IP restriction for Render), and keep `ssl` enabled (the app already uses SSL except for localhost).

**`password authentication failed`**  
Reset the database password in Supabase and update `DATABASE_URL`. Special characters in the password must be URL-encoded.

**Session / CSRF errors after deploy**  
Set `TRUST_PROXY=1` and `NODE_ENV=production` so secure cookies work behind Render. Use HTTPS only.

**Access codes from local don’t work in production**  
Either you used a different `ACCESS_CODE_PEPPER`, or you seeded a different database. Regenerating codes in the production admin dashboard fixes it.

**`Need at least two confirmed participants`**  
Mark people Confirmed, not Tentative, then finalize.

**Guest still sees “roulette isn’t ready”**  
The draw is still `draft`. Finalize in admin.

**Someone cancelled after spinning**  
Do not edit one pairing by hand. Reset the full draw, update attendance, then finalize again — and tell guests who already saw a name that they will get a new person.

**Port already in use**  
Change `PORT` in `.env`.

## Project layout

```
christmas-roulette/
  public/           Guest and admin frontend
  routes/           Express APIs
  middleware/       Sessions, CSRF, role checks
  database/         PostgreSQL schema
  lib/              Database pool, hashing, draw algorithm
  scripts/          create-admin, seed-participants
  server.js
```

## Before the actual Christmas event

- [ ] Production HTTPS works on phones
- [ ] Every attending guest has a private code
- [ ] Tentative guests are not in the confirmed count
- [ ] You finalized only when the list is stable
- [ ] You tested two accounts and confirmed privacy
- [ ] `access-codes.txt` is not in git
- [ ] You have a plan if someone drops out after the draw (full reset, not a silent reshuffle)
