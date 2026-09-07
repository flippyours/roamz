import { normalizeEntry } from "@/lib/route-rules";
import { getRun, json, parseBody, routeError } from "@/lib/route-server";
import { isSupabaseError, supabaseRequest } from "@/lib/supabase-server";

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
    try {
      const { data } = await supabaseRequest<Array<{ entry_id: string; review_status: string; created: boolean }>>(
        "rpc/submit_roamz_whitelist",
        {
          method: "POST",
          body: JSON.stringify({
            p_run_id: run.id,
            p_x_handle: value.x_handle,
            p_wallet_address: value.wallet_address,
            p_comment_url: value.comment_url,
            p_consent_at: new Date().toISOString(),
          }),
        },
      );
      const result = data[0];
      if (!result) throw new Error("EMPTY_SUBMISSION");
      return json({ entry_id: result.entry_id, status: result.review_status }, result.created ? 201 : 200);
    } catch (error) {
      if (isSupabaseError(error)) {
        const details = JSON.stringify((error as Error & { details?: unknown }).details ?? "");
        if (details.includes("DUPLICATE_ENTRY")) {
          return json({ error: "This wallet, X handle, or reply has already been submitted." }, 409);
        }
        if (details.includes("ROUTE_ALREADY_USED")) {
          return json({ error: "This route pass has already been submitted." }, 409);
        }
        if (details.includes("ROUTE_INVALID")) {
          return json({ error: "Complete the route again before submitting." }, 403);
        }
      }
      throw error;
    }
  } catch (e) { return routeError(e); }
}
