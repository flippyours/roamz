import { RUN_TTL_MS } from "./route-rules";

export type Run = { id: string; created_at: number; expires_at: number; checkpoint_at: number; collected: number; completed_at: number | null; used: number };
export function db() {
  const runtimeEnv = (globalThis as typeof globalThis & {
    env?: { DB?: unknown };
  }).env;

  const database = runtimeEnv?.DB;

  if (!database) {
    throw new Error("Database unavailable");
  }

  return database as {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T>(): Promise<T | null>;
      };
    };
  };
}
export function sessionId(request: Request) {
  const value = request.headers.get("cookie")?.match(/(?:^|;\s*)roamz_route=([^;]+)/)?.[1];
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : null;
}
export async function getRun(request: Request): Promise<Run | null> {
  const id = sessionId(request); if (!id) return null;
  return db().prepare("SELECT id, created_at, expires_at, checkpoint_at, collected, completed_at, used FROM route_runs WHERE id = ? AND expires_at > ?").bind(id, Date.now()).first<Run>();
}
export function cookie(id: string, request: Request) {
  return `roamz_route=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${RUN_TTL_MS / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
export async function parseBody(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("ORIGIN");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON");
  if (Number(request.headers.get("content-length") || 0) > 4096) throw new Error("SIZE");
  const text = await request.text(); if (text.length > 4096) throw new Error("SIZE");
  const data = JSON.parse(text); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON");
  return data as Record<string, unknown>;
}
export function routeError(e: unknown) {
  if (e instanceof Error && ["ORIGIN", "JSON", "SIZE"].includes(e.message)) return json({ error: "This request could not be accepted. Refresh the page and try again." }, 400);
  if (e instanceof SyntaxError) return json({ error: "Invalid request." }, 400);
  console.error("Roamz route request failed", e instanceof Error ? e.message : "Unknown error");
  return json({ error: "The route is having a quiet moment. Please try again shortly." }, 503);
}
export async function clientKey(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const day = new Date().toISOString().slice(0, 10);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`roamz:${day}:${ip}`));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("");
}
