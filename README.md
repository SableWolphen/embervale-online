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

## New Sparks features (October 2026)

The **More** tab now includes:
- Discover preferences by age and relationship intention, optional hidden-profile setting, and Slow Dating Mode (five profiles per discovery request)
- Interest-based sorting and shared-interest highlights; these are heuristic, **not scientific compatibility verification**
- First Spark optional conversation questions and three profile prompts
- Optional voice-introduction URL (HTTPS-hosted audio; uploads and audio moderation not yet supported)
- Date proposals to mutual matches, with acceptance or decline by the recipient
- Private self-managed safety check-ins; **not background notifications, emergency dispatch, or trusted-contact messaging**
- Two-sided Relationship Mode invitation and acceptance, pausing both profiles from discovery until leaving
- Saved passes, blocks, reports and existing message restrictions

Safety note: the current "verification" field is always false. **Identity and age verification are not implemented**; never represent someone as verified. Sign-up ages are self-declared and reports require manual operational review. Additional scam detection, anti-harassment controls, production auth, report triage, trust-and-safety staffing and proper database storage are mandatory before inviting the public.

## Validation
`npm run check` validates server and client JavaScript syntax. `node --test tests/dating.test.mjs` runs a real-server smoke test covering registration, filters, likes, mutual matches, messaging, plan acceptance, check-ins, relationship invitations and blocking. GitHub Actions workflow `.github/workflows/dating-checks.yml` runs both on pushes and pull requests. Inspect actual Actions results before considering the build verified.
