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

