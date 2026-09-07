import { MIN_CHECKPOINT_MS, MIN_ROUTE_MS, RUN_TTL_MS } from "@/lib/route-rules";
import { clientKey, cookie, getRun, json, parseBody, routeError, type Run } from "@/lib/route-server";
import { queryValue, supabaseRequest } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const run = await getRun(request);
    return json({ collected: run?.collected ?? 0, completed: !!run?.completed_at, submitted: !!run?.used, duration: run?.completed_at ? Math.round((run.completed_at - run.created_at) / 1000) : null });
  } catch (e) { return routeError(e); }
}

export async function POST(request: Request) {
  try {
    const body = await parseBody(request), now = Date.now();
    const run = await getRun(request);
    if (body.event === "start") {
      if (run && !run.used) return json({ collected: run.collected, completed: !!run.completed_at, submitted: false });
      const key = await clientKey(request);
      const { data: recent } = await supabaseRequest<Array<{ id: string }>>(
        `roamz_route_runs?select=id&client_key=eq.${queryValue(key)}&created_at=gt.${now - 600000}&limit=20`,
      );
      if (recent.length >= 20) return json({ error: "A few too many new routes. Please try again in ten minutes." }, 429);
      const id = crypto.randomUUID();
      await supabaseRequest<Run[]>("roamz_route_runs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ id, client_key: key, created_at: now, expires_at: now + RUN_TTL_MS, checkpoint_at: now, collected: 0, used: false }),
      });
      return json({ collected: 0, completed: false, submitted: false }, 201, { "Set-Cookie": cookie(id, request) });
    }
    if (!run) return json({ error: "Your route pass expired. Refresh to start a new adventure." }, 401);
    if (run.used) return json({ error: "This route pass already has an application." }, 409);
    if (body.event === "signal") {
      const index = body.index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 4) return json({ error: "Unknown signal." }, 400);
      // Idempotent retry: a lost response must not cost the player their checkpoint.
      if (index < run.collected) return json({ collected: run.collected });
      if (index !== run.collected) return json({ error: "Find the signals in route order. Retry saving your progress." }, 409);
      if (now - run.checkpoint_at < MIN_CHECKPOINT_MS) return json({ retry_after_ms: MIN_CHECKPOINT_MS - (now - run.checkpoint_at) }, 425);
      const { data: updated } = await supabaseRequest<Run[]>(
        `roamz_route_runs?id=eq.${queryValue(run.id)}&collected=eq.${index}&used=is.false&expires_at=gt.${now}`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ collected: index + 1, checkpoint_at: now }) },
      );
      if (!updated.length) return json({ error: "Your route changed in another tab. Refresh to continue." }, 409);
      return json({ collected: index + 1 });
    }
    if (body.event === "finish") {
      if (run.completed_at) return json({ completed: true, collected: 5 });
      if (run.collected !== 5) return json({ error: "Find all five signals before opening Gate 404." }, 403);
      if (now - run.created_at < MIN_ROUTE_MS) return json({ retry_after_ms: MIN_ROUTE_MS - (now - run.created_at) }, 425);
      const { data: updated } = await supabaseRequest<Run[]>(
        `roamz_route_runs?id=eq.${queryValue(run.id)}&collected=eq.5&used=is.false&completed_at=is.null`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ completed_at: now }) },
      );
      if (!updated.length) return json({ error: "Your route changed in another tab. Refresh to continue." }, 409);
      return json({ completed: true, collected: 5 });
    }
    return json({ error: "Unknown route action." }, 400);
  } catch (e) { return routeError(e); }
}
