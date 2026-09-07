# Roamz — The Lost Route

An original lightweight Three.js mini-adventure, with the supplied Roamz NFT artwork as its visual reference. The former single HTML page is preserved separately; this implementation is a complete React + Worker application with durable allowlist records.

## Experience

- Explore Forest Clearing, collect five numbered signals in sequence, return to Gate 404.
- After Gate 404, the user must open and manually confirm three X tasks: follow `@roamznft`, like/repost the announcement, and reply. `ANNOUNCEMENT_URL` in `app/roamz-experience.tsx` is a dummy status URL that must be replaced before public launch.
- Desktop: WASD/arrows, click-to-move, Space/Shift dash, Escape pause.
- Mobile: left thumb joystick, right dash button. Pause on tab switch. No game-over or time limit.
- A black oval head, white oval eyes, yellow bucket, grey tech jacket and rear-only bedroll pack. The game model is a 3D adaptation, not a pixel-identical reproduction of the 2D master.
- Rendering has no external model downloads, physics engine, postprocessing, or real-time shadow maps. Shared low-poly meshes/materials, capped device pixel ratio, lazy-loaded Three.js, cleanup on unmount.

## Source map

- `app/roamz-experience.tsx`: interface, modals, input controls, allowlist application.
- `app/globals.css`: responsive brand design system.
- `lib/roamz-game.ts`: 3D world, character, movement, collision, collectibles and sound.
- `lib/route-rules.ts`: shared world positions and input validation.
- `app/api/route/route.ts`: server route session, checkpoints, completion.
- `app/api/whitelist/route.ts`: durable allowlist submission.
- `db/schema.ts` and `drizzle/`: database schema and migrations.

## Registration and privacy

Applications save to this site's D1 `whitelist_entries` table, **not an existing production website's database**. No browser local storage is used as proof. Run state is stored server-side behind an HttpOnly same-site cookie. Sequential checkpoints and minimum timing, idempotent retries, unique wallet/handle/run constraints and a new-run throttle provide basic abuse resistance. This does **not** prove human play and is not comprehensive anti-bot protection: scripted clients can reproduce API calls. Add a managed bot challenge and stricter server replay verification before a high-volume public campaign. Social task confirmations are user attestations, not verified against X's API. The submitted reply URL is checked for format and matching account only. Pending entries are not automatically GTD or FCFS allocations.

Only POST is exposed for applications; there is no public endpoint to enumerate addresses or handles. An application requires consent. Route passes expire after two hours. Application data remains stored for review; establish the campaign retention/deletion policy before public launch. The run throttle uses a daily pseudonymous IP hash; raw IP is not stored in the application database.

The original file only contained placeholder X/OpenSea/campaign links. Broken placeholder links are intentionally not displayed. Set real project links and campaign requirements before public launch. No mint, wallet connection, signature or asset transfer is implemented.

## Deployment

Use the existing package scripts and Sites lifecycle. Database: `DB`. The application is published privately for the owner to review; it does not replace the user's existing public domain. A server-rendered deployment is required for the allowlist API. It is not a standalone HTML file.

## Art assets

The two supplied artwork screenshots are shown through a fixed image viewport that exposes only the original square artwork. They are not newly generated NFT art. Replace them with exported NFT PNGs for the public campaign when available.
