/**
 * Butterbase client factory — patched path prefix.
 *
 * Ported from Kevin's calendar component (`lib/butterbase.ts`). The SDK builds
 * `/v1/<appId>/...` paths but our Butterbase server prepends its own `/v1/<appId>/`
 * (it identifies the app from the bearer token), so the SDK's prefix is stripped
 * before each request to avoid a doubled, 404-ing path.
 *
 * Credentials come from env (.env, git-ignored) — never hard-coded.
 */
import { createClient, type ButterbaseClient } from "@butterbase/sdk";

export function createPatchedClient(opts: {
  appId: string;
  apiUrl: string;
  apiKey: string;
}): ButterbaseClient {
  const bb = createClient({
    appId: opts.appId,
    apiUrl: opts.apiUrl,
    anonKey: opts.apiKey,
    persistSession: false,
  });

  const prefix = `/v1/${opts.appId}`;
  const stripPath = (path: string) =>
    path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;

  type RequestFn = (method: string, path: string, body?: unknown, headers?: unknown) => unknown;
  const patch = (name: "request" | "requestRaw" | "requestBlob" | "requestStream") => {
    const inst = bb as unknown as Record<string, RequestFn>;
    const original = inst[name]!.bind(bb);
    inst[name] = (method, path, body, headers) => original(method, stripPath(path), body, headers);
  };

  patch("request");
  patch("requestRaw");
  patch("requestBlob");
  patch("requestStream");

  return bb;
}

/** Build a client from BUTTERBASE_* env, or return null if not configured. */
export function butterbaseFromEnv(): ButterbaseClient | null {
  const appId = process.env.BUTTERBASE_APP_ID;
  const apiKey = process.env.BUTTERBASE_API_KEY;
  if (!appId || !apiKey) return null;
  return createPatchedClient({
    appId,
    apiKey,
    apiUrl: process.env.BUTTERBASE_BASE_URL ?? "https://api.butterbase.ai",
  });
}
