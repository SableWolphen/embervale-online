# Embervale Online — Playable 2D Browser MMO

## Quest-world update (v0.7)

Questing is no longer one mandatory chain. Embervale now mixes **regional stories** with **standalone side stories**, so NPCs have their own lives and problems instead of every character pointing toward the same apocalypse.

### Regional stories — playable independently

- **The Bell Beneath the Bridge** — Elder Mira investigates Greenmeadow’s damaged bridge, an impossible warning bell, and black Moonstone glass.
- **Smoke on the Ridge** — Guard Arden investigates strange goblin raids in the Iron Hills. It can be started without completing Mira’s story.
- **The Cinder Crown** — Sage Elowen confronts the Ash Warden and the history of the ruined keepers. It can be started whenever the player reaches the Ashen Ruins.

### Standalone side stories

- **The One That Got Away** — Fisher Jory launches a deeply serious investigation into the fish that allegedly stole his lucky brass lure.
- **A Scout’s Promise** — Scout Nessa asks the player to reopen a dangerous supply trail and help an elderly healer she once promised to protect.
- **A Name in Ash** — the Echo of Cael asks the player to recover one precious name erased from his memory by the Cinder Crown.

Each quest uses multi-page NPC dialogue, changing objectives, progress-aware return lines, turn-in scenes, rewards, and post-quest dialogue. Quest markers show available (!), active (…), and ready-to-turn-in (?) states.

Embervale Online is an original old-school fantasy MMO-style web game. This build is a substantial playable alpha: players can enter the same persistent world, walk around together, gather shared resources, fight shared monsters, complete quests, craft equipment, use shops and banks, chat, customize their character, and progress eight skills.

The visual art is original and self-contained. Terrain, characters, pets, monsters, NPCs, trees, rocks, fishing spots, buildings, water/lava, particles, nameplates, health bars, selection rings, and the minimap are drawn by the browser game itself; there are no copied RuneScape assets.

## Playable features

- Real-time top-down movement with WASD, arrows, click-to-walk, and mobile touch controls
- Other online players rendered in the same world
- Three explorable regions:
  - Greenmeadow
  - Iron Hills
  - Ashen Ruins
- Level-gated travel between regions
- Shared resource nodes with MMO-style respawn timers
- Woodcutting, Mining, Fishing, Gathering, Combat, Smithing, Cooking, and Fletching
- Shared enemies and an Ash Warden boss
- Server-authoritative damage, XP, drops, inventory, crafting, movement steps, and rewards
- Six authored story quests: three independent regional stories and three standalone side stories
- Persistent character progression
- Backpack and equipment system
- Bronze equipment, Oak Shortbow, and Moonstone Blade
- Rare Moonstone drops
- Ember Fox companion drop
- Merchant shops
- Persistent bank storage
- Global tavern chat and nearby-player list
- Character tunic customization
- Original procedural/vector game graphics
- Minimap, combat feedback, resource effects, and adventure log
- Desktop and mobile layouts
- Installable web-app manifest

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

Open the URL in two browser windows or devices to test multiplayer.

## Deploy

The frontend and MMO server are served by one Node process. Use a host that supports a continuously running Node.js process and WebSockets, such as Railway, Render, Fly.io, a VPS, or a container platform.

Static-only hosting such as GitHub Pages cannot run the MMO server by itself.

The server uses the host-provided `PORT` environment variable when available.

## Persistence

Characters are stored in:

```text
data/world.json
```

The server saves on gameplay changes and periodically. For a public production launch, replace JSON-file persistence with a durable database.

## Production hardening before a large public launch

The game is playable, but a public MMO should eventually add proper account authentication, PostgreSQL or another durable database, Redis/pub-sub for multi-server scaling, moderation tools, profanity/spam filtering, backups, rate limiting, server metrics, account recovery, admin tools, exploit logging, and stronger movement/combat validation.

## Project structure

```text
embervale_mmo/
├─ package.json
├─ server.mjs
├─ README.md
└─ public/
   ├─ index.html
   ├─ styles.css
   ├─ game.js
   ├─ icon.svg
   └─ manifest.webmanifest
```

## Quest world — 30 story quests

The game now contains 30 quests total: the original six multi-stage regional/side stories plus 24 additional independent quests. Every new quest has named-NPC dialogue, an objective with tracked progress, a completion scene, a reward, and post-quest dialogue. They are intentionally mixed between comedy, mystery, profession stories, memorials, local folklore, challenge quests, and personal character stories rather than one giant connected plot.

New quests include:

- The Bread That Refused to Rise
- Copper in the Margins
- Foxes, Hens, and Other Negotiations
- The Singing Floorboard
- Lights on the Water
- Tea for a Terrible Mood
- The Rat King of Greenmeadow
- The First Vein
- The Pickaxe With My Name On It
- The Bell in the Wolf Den
- The Goblin Poet
- Supper Above the Clouds
- An Axe for My Father
- North Is Missing
- Bronze for the Nameless
- One Straight Shot
- A Garden in Ash
- The Last Watch
- The Door That Walked Away
- An Offering With No God
- A Blade That Remembers Heat
- Dinner From a Lava Pool
- Once More, With Preparation
- Letters Never Sent
