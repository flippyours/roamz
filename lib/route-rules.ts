export const SIGNALS = [
  { x: -6, z: 4, name: "The first step" },
  { x: -8, z: -3, name: "Through the trees" },
  { x: -1, z: -7, name: "A forgotten place" },
  { x: 7, z: -4, name: "Out of the static" },
  { x: 7, z: 4, name: "Almost somewhere" },
] as const;
export const SPAWN = { x: 0, z: 7 };
export const GATE = { x: 0, z: -1.7 };
export const WORLD_RADIUS = { x: 12.4, z: 10.4 };
export const MIN_ROUTE_MS = 12000;
export const MIN_CHECKPOINT_MS = 700;
export const RUN_TTL_MS = 2 * 60 * 60 * 1000;
export const WALK_SPEED = 4.5;
export const DASH_COOLDOWN = 1.6;
export type RunState = { collected: number; completed: boolean; submitted: boolean };
export function validPoint(x: number, z: number) { return (x / WORLD_RADIUS.x) ** 2 + (z / WORLD_RADIUS.z) ** 2 < 1; }
export function normalizeEntry(input: Record<string, unknown>) {
  const x_handle = String(input.x_handle ?? "").trim().replace(/^@/, "");
  const wallet_address = String(input.wallet_address ?? "").trim();
  const comment_url = String(input.comment_url ?? "").trim();
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(x_handle)) return { error: "Enter a valid X handle (1–15 letters, numbers, or underscores).", field: "x_handle" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet_address)) return { error: "Enter a valid EVM address: 0x followed by 40 characters.", field: "wallet_address" };
  try {
    const url = new URL(comment_url);
    const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/([0-9]{1,25})\/?$/);
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || url.username || url.password || url.port || !match || match[1].toLowerCase() !== x_handle.toLowerCase()) throw new Error();
    return { value: { x_handle: x_handle.toLowerCase(), wallet_address: wallet_address.toLowerCase(), comment_url: `https://x.com/${match[1]}/status/${match[2]}` } };
  } catch { return { error: "Paste an https://x.com reply link from the same X handle.", field: "comment_url" }; }
}
