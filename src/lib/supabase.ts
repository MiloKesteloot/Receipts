import { createClient } from "@supabase/supabase-js";

import { SESSION_STORAGE } from "./session-storage";

/**
 * Project URL from `.env` (Project Settings → Data API).
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * Publishable key from `.env`. Safe to ship: Row Level Security decides what
 * each user can read or change.
 */
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Shared Supabase client, or null when `.env` is missing its keys.
 */
export const SUPABASE =
    SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                storage: SESSION_STORAGE,
                persistSession: true,
                // AuthProvider pauses refreshing while the app is in the background.
                autoRefreshToken: true,
                // Native apps have no page URL; OAuth redirects are handled in auth.ts.
                detectSessionInUrl: false,
                flowType: "pkce",
            },
        })
        : null;

/**
 * Backwards-compatible alias for the Supabase client.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const supabase = SUPABASE;
