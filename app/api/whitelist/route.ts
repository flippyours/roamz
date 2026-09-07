import { normalizeEntry } from "@/lib/route-rules";
import { db, getRun, json, parseBody, routeError } from "@/lib/route-server";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request);
    if (body.company) return json({ error: "Unable to accept this application." }, 400);
    const parsed = normalizeEntry(body);
    if (parsed.error) return json({ error: parsed.error, field: parsed.field }, 400);
    if (body.social_tasks_complete !== true) return json({ error: "Complete and confirm all three X tasks first." }, 400);
    if (body.consent !== true) return json({ error: "Please acknowledge how your details will be used." }, 400);
    const run = await getRun(request);
    if (!run || !run.completed_at || run.collected !== 5) return json({ error: "Complete the route to unlock your allowlist application." }, 403);
    const value = parsed.value!;
    const existing = await db().prepare("SELECT id, wallet_address, x_handle, comment_url FROM whitelist_entries WHERE run_id = ?").bind(run.id).first<{ id: string; wallet_address: string; x_handle: string; comment_url: string }>();
    if (existing) {
      if (existing.wallet_address === value.wallet_address && existing.x_handle === value.x_handle && existing.comment_url === value.comment_url) return json({ entry_id: existing.id, status: "pending_review" });
      return json({ error: "This route pass has already been submitted." }, 409);
    }
    const id = `RZ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, now = Date.now();
    const results = await db().batch([
      db().prepare("INSERT OR IGNORE INTO whitelist_entries (id, run_id, x_handle, wallet_address, comment_url, duration, status, consent_at, created_at) SELECT ?, ?, ?, ?, ?, ?, 'pending_review', ?, ? WHERE EXISTS (SELECT 1 FROM route_runs WHERE id = ? AND used = 0 AND collected = 5 AND completed_at IS NOT NULL AND expires_at > ?)").bind(id, run.id, value.x_handle, value.wallet_address, value.comment_url, Math.round((run.completed_at - run.created_at) / 1000), now, now, run.id, now),
      db().prepare("UPDATE route_runs SET used = 1 WHERE id = ? AND EXISTS (SELECT 1 FROM whitelist_entries WHERE run_id = ?)").bind(run.id, run.id),
    ]);
    if (!results[0].meta.changes) return json({ error: "This wallet or X handle already has an application. Only one entry per wanderer." }, 409);
    return json({ entry_id: id, status: "pending_review" }, 201);
  } catch (e) { return routeError(e); }
}
