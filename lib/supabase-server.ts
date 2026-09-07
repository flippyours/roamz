import "server-only";

type SupabaseOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

function environment() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_CONFIG");
  }

  return { url, key };
}

export async function supabaseRequest<T>(
  path: string,
  options: SupabaseOptions = {},
): Promise<{ data: T; response: Response }> {
  const { url, key } = environment();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  let data: T;

  try {
    data = (text ? JSON.parse(text) : null) as T;
  } catch {
    data = text as T;
  }

  if (!response.ok) {
    const error = new Error("SUPABASE_REQUEST") as Error & {
      status?: number;
      details?: unknown;
    };
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return { data, response };
}

export function queryValue(value: string | number) {
  return encodeURIComponent(String(value));
}

export function isSupabaseError(error: unknown) {
  return error instanceof Error && error.message === "SUPABASE_REQUEST";
}
