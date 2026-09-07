// Minimal runtime binding contracts used by this application.
interface D1Result<T = unknown> { results: T[]; success: boolean; meta: { changes: number; last_row_id?: number; duration?: number } }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}
interface D1Database { prepare(query: string): D1PreparedStatement; batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>; exec(query: string): Promise<{ count: number; duration: number }> }
interface Fetcher { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> }
declare module "cloudflare:workers" { export const env: { DB: D1Database; ASSETS: Fetcher }; }
