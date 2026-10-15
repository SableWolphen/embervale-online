# Embervale — Dating App MVP

Embervale Online has been repurposed as **Embervale**, an adults-only (18+) dating web app.

## Features

- Email/password registration and sign-in
- Editable dating profiles (name, age, city, pronouns, interests, bio, dating intentions, HTTPS photo)
- Browse real registered profiles (no fake sample matches)
- Likes and mutual matches
- Private direct messages for mutual matches only
- Block and report controls
- Responsive mobile-first design and installable web app

## Run

Requires Node.js 20+.

```bash
npm install
npm run check
npm start
```

Open http://localhost:3000.

## Storage and deployment

This starter uses `data/dating.json` for persistence, serialized to avoid overlapping saves. **Do not deploy to ephemeral or multi-instance servers as-is**: deploy with a persistent filesystem or migrate to a transactional database (recommended: PostgreSQL). Existing RPG files remain in the repository for historical reference but are not loaded by the new app. Existing RPG user data is not migrated.

## Important limitations before public launch

**Do not market this MVP as a fully secure, production-ready dating service.** It needs:
- Email verification, password resets, server-side session persistence/rotation, HttpOnly secure cookie auth, and account deletion/export
- Age/identity verification (the current age field is self-declared)
- Moderation staff tooling and prompt handling of user reports, anti-harassment protections, anti-spam, abuse monitoring, and stronger request limits
- Consent/privacy notices, Terms of Service, privacy policy, data retention rules, and jurisdiction-specific compliance review
- Photo uploads through a vetted image service, moderation and image content checks
- PostgreSQL migrations, automated tests, backups, monitoring and deployment checks
- Improved personalization, preference-based discovery and accessibility QA

This MVP displays **real registered profiles only** and does not claim verified users. Do not add fabricated profiles or AI-generated users portrayed as real.

## Architecture

- `dating-server.mjs` — zero-dependency Node HTTP API and static server
- `public/index.html` — dating interface
- `public/dating.css` — responsive presentation
- `public/dating.js` — client views and interactions
- `data/dating.json` — generated runtime database, not for source control
