import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client factories.
 *
 * This module is marked `server-only`: it reads secret keys from the
 * environment, so importing it from a Client Component is a build-time error.
 * None of these keys ever reach the browser bundle.
 *
 *  - `supabaseAnon()`  — anon key. Even on the server we go through RLS, which
 *    restricts the anon role to PUBLISHED content only (defense in depth).
 *  - `supabaseAdmin()` — service-role key. Bypasses RLS; used only by the
 *    guarded admin write route. (The seed script builds its own client because
 *    it runs under tsx, outside the React Server Components boundary where the
 *    `server-only` import would otherwise throw.)
 */

const AUTH_OPTS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function supabaseAnon(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), AUTH_OPTS);
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), AUTH_OPTS);
}
