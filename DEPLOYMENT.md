# Embervale Online deployment

This build preserves all 30 quests and the original browser graphics and gameplay.

## Free hosting

Run one Render Free Node web service and a Neon Free PostgreSQL database.
Render sleeps during inactivity; opening the game may require a cold start.
This is a small public alpha, not an always-on production SLA.

Use `npm ci` to build and `npm start` to run. Select Node 22, Free compute,
and branch `main`. Set `NODE_ENV=production`, `NODE_VERSION=22`, and a secret
`DATABASE_URL` containing the Neon TLS connection URL. Set health check path
to `/healthz`. Render supplies `PORT`; the server binds to `0.0.0.0`.

The browser uses the same public hostname for HTTPS and secure WebSockets.
The server creates its PostgreSQL table on first startup and stores characters,
skills, inventory, bank, gear, quests, and appearance. Do not run multiple
instances: the shared world is held in one process and saves are a serialized
snapshot. Monsters and resources reset when the process restarts, as before.

Never put the database URL in GitHub or browser JavaScript. The server refuses
to start in production without it and refuses to silently discard load errors.
Local development continues to use `data/world.json` with atomic file writes.

## Verification

Run `npm run check` and `node scripts/smoke.mjs`. The smoke test verifies HTTP,
health checks, two players joining the shared world, all 30 quests, credential
privacy, and saved-character restoration after restarting the server.

Character access uses a browser-held reconnect credential. Keep browser storage
to retain your character; there is no password login or recovery flow yet.
Reconnect credentials are no longer exposed to other players in world updates.

For release verification, open the public URL, join a character, check the
quest journal, connect a second player, and verify character restoration after
a Render restart. Free resource quotas still apply to both providers.
