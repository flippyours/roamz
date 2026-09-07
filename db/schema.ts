import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const routeRuns = sqliteTable("route_runs", {
  id: text("id").primaryKey(),
  clientKey: text("client_key").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  checkpointAt: integer("checkpoint_at").notNull(),
  collected: integer("collected").notNull().default(0),
  completedAt: integer("completed_at"),
  used: integer("used").notNull().default(0),
}, t => [index("idx_route_runs_client_created").on(t.clientKey, t.createdAt)]);

export const whitelistEntries = sqliteTable("whitelist_entries", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  xHandle: text("x_handle").notNull(),
  walletAddress: text("wallet_address").notNull(),
  commentUrl: text("comment_url").notNull(),
  duration: integer("duration").notNull(),
  status: text("status").notNull().default("pending_review"),
  consentAt: integer("consent_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("idx_entries_run").on(t.runId), uniqueIndex("idx_entries_wallet").on(t.walletAddress), uniqueIndex("idx_entries_handle").on(t.xHandle)]);
