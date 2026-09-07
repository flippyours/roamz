import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

// Exercise the actual route handlers with SQLite and an in-memory D1 adapter.
// No production records, network requests, browsers or real user addresses.
test("Roamz: validation, route gate, save, retries, duplicates, origin and expiry", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_soft_butterfly.sql", import.meta.url), "utf8"));
  function statement(sql) {
    let values = [];
    return {
      bind(...v) { values = v; return this; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async run() { const r = sqlite.prepare(sql).run(...values); return { success: true, results: [], meta: { changes: Number(r.changes) } }; },
    };
  }
  globalThis.__roamzTestDb = { prepare: statement, async batch(statements) { sqlite.exec("BEGIN"); try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec("COMMIT"); return out; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  const compile = async (file, out) => {
    await build({ entryPoints: [file], outfile: out, bundle: true, platform: "node", format: "esm", plugins: [{ name: "test-d1", setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "test-d1", namespace: "test" })); b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const env={DB:globalThis.__roamzTestDb}" })); } }] });
    return import(new URL(`../${out}`, import.meta.url));
  };
  const route = await compile("app/api/route/route.ts", "outputs/test-route.mjs");
  const whitelist = await compile("app/api/whitelist/route.ts", "outputs/test-whitelist.mjs");
  const rules = await compile("lib/route-rules.ts", "outputs/test-rules.mjs");
  const valid = { x_handle: "roamz_test", wallet_address: `0x${"a".repeat(40)}`, comment_url: "https://x.com/roamz_test/status/123456", consent: true, social_tasks_complete: true };
  assert.ok(rules.normalizeEntry(valid).value);
  for (const comment_url of ["javascript:alert(1)", "https://x.com.evil.test/roamz_test/status/1", "https://x.com/other/status/1", "http://x.com/roamz_test/status/1", "https://x.com/roamz_test/status/1/extra", "https://evil@x.com/roamz_test/status/1"]) assert.ok(rules.normalizeEntry({ ...valid, comment_url }).error);
  assert.ok(rules.normalizeEntry({ ...valid, wallet_address: "0x123" }).error);
  const realNow = Date.now; let now = realNow(); Date.now = () => now;
  let cookie = "";
  const request = (path, body, origin = "https://roamz.test") => new Request(`https://roamz.test${path}`, { method: "POST", headers: { origin, cookie, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify(body) });
  try {
    assert.equal((await whitelist.POST(request("/api/whitelist", valid))).status, 403);
    let res = await route.POST(request("/api/route", { event: "start" })); assert.equal(res.status, 201); cookie = res.headers.get("set-cookie").split(";")[0];
    assert.match(res.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    assert.equal((await route.POST(request("/api/route", { event: "signal", index: 3 }))).status, 409);
    assert.equal((await route.POST(request("/api/route", { event: "finish" }))).status, 403);
    assert.equal((await route.POST(request("/api/route", { event: "signal", index: 0 }))).status, 425);
    for (let index = 0; index < 5; index++) { now += 2500; res = await route.POST(request("/api/route", { event: "signal", index })); assert.equal(res.status, 200); assert.equal((await res.json()).collected, index + 1); }
    assert.equal((await route.POST(request("/api/route", { event: "signal", index: 3 }))).status, 200);
    assert.equal((await route.POST(request("/api/route", { event: "finish" }))).status, 200);
    assert.equal((await whitelist.POST(request("/api/whitelist", { ...valid, social_tasks_complete: false }))).status, 400);
    assert.equal((await whitelist.POST(request("/api/whitelist", { ...valid, consent: false }))).status, 400);
    assert.equal((await whitelist.POST(request("/api/whitelist", valid, "https://evil.test"))).status, 400);
    res = await whitelist.POST(request("/api/whitelist", valid)); assert.equal(res.status, 201); const saved = await res.json(); assert.match(saved.entry_id, /^RZ-/);
    res = await whitelist.POST(request("/api/whitelist", valid)); assert.equal(res.status, 200); assert.equal((await res.json()).entry_id, saved.entry_id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM whitelist_entries").get().n, 1);
    res = await route.GET(new Request("https://roamz.test/api/route", { headers: { cookie } })); const state = await res.json(); assert.equal(state.submitted, true); assert.equal(state.wallet_address, undefined);
    res = await route.POST(request("/api/route", { event: "start" })); cookie = res.headers.get("set-cookie").split(";")[0];
    for (let index = 0; index < 5; index++) { now += 2500; await route.POST(request("/api/route", { event: "signal", index })); }
    await route.POST(request("/api/route", { event: "finish" }));
    assert.equal((await whitelist.POST(request("/api/whitelist", valid))).status, 409);
    now += rules.RUN_TTL_MS + 1;
    assert.equal((await route.POST(request("/api/route", { event: "finish" }))).status, 401);
  } finally { Date.now = realNow; sqlite.close(); delete globalThis.__roamzTestDb; }
});
