# Kindtill concept

A portfolio concept by Luka Skhiladze and Giorgi Kheladze: a scroll-led story page and a three-path registration form. **Kindtill is a fictional brand.**

- `/` — the story page, built in Webflow (`bfg-spec.webflow.io`).
- `/register` — this repository: a Webflow Cloud app (Astro + SQLite/D1) that runs the three-path registration form end to end.

## Photo credits

Didier Baertschiger, CC0 (ocean). Kimberly Farmer and Eric Li on Unsplash. Troy Carroll on Pexels. Radu Galan, Kacper Slusarczyk and Ubuntu Kylin community contributors, CC BY-SA via Ubuntu community wallpapers, cropped. Licences as listed.

## The registration app (`/register`)

Astro on Webflow Cloud (Cloudflare Workers) with a D1 (SQLite) database. One shared form with three paths; each path only shows, accepts and stores its own questions.

- **Duplicates** are blocked by the database: one registration per email and path (emails are trimmed and lower-cased first). A repeat gets a message that reveals nothing stored, and the address on file is sent a link instead.
- **Idempotency**: every attempt carries a key, so a double tap, a retry after a lost response, or two requests at once save one registration.
- **Consent**: "contact me about this registration" and "news and updates" are separate, never pre-ticked, and stored with the exact wording and time; every change is logged.
- **Reliability**: the registration and its emails/CRM hand-off are written in one transaction; emails and the CRM sync are then delivered with retries, so a slow email service can't lose a registration.
- **Failures** keep every answer on screen (and on the device), and offer Try again, Copy my answers and Email them instead.
- **Private manage link** in every confirmation: see what's stored, switch updates off, or delete everything.

### Environment variables

| Name | Secret | Default | Purpose |
|---|---|---|---|
| `SPEC_MODE` | no | `1` | `0` removes the reviewer tools (simulated outage) |
| `TURNSTILE_SITE_KEY` | no | Cloudflare's always-pass test key | Bot check widget |
| `TURNSTILE_SECRET` | yes | Cloudflare's always-pass test secret | Bot check verification |
| `RESEND_API_KEY` + `MAIL_FROM` | key: yes | unset | When both are set, emails are sent; otherwise they're kept as previews |
| `CRM_WEBHOOK_URL` | yes | unset | When set, each registration is POSTed here as JSON (Zapier, Make, HubSpot workflows…) |

### Run it locally

```bash
npm install
npm run build
npx wrangler d1 migrations apply DB --local --config wrangler.json
npx wrangler dev --var TURNSTILE_MODE:off      # http://localhost:8787/register/
```

### Break tests

`bash tests/run.sh` builds the app, starts it against a fresh local database and runs the Playwright tests (Python 3, `pip install pytest playwright`, Chromium). Results: [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md).
