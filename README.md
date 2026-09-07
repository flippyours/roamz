# Roamz — The Lost Route

A lightweight 3D adventure and allowlist application for the Roamz NFT collection.

See [ROAMZ-HANDOFF.md](./ROAMZ-HANDOFF.md) for gameplay, source layout, deployment requirements, privacy and abuse-prevention limitations.

## Development

Use Node 22 or later. Install with `npm run install:ci`, build with `npm run build`, and test route and submission behavior with `npm test`. Source styling is in `app/globals.css`, game logic in `lib/roamz-game.ts`, and durable application state in D1 under `db/schema.ts`.

This is a server-backed app, not a standalone HTML file. Public campaign links must be supplied before public launch.
