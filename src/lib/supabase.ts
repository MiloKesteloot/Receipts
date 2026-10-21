import { createClient } from "@supabase/supabase-js";

/**
 * TODO write description
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * TODO write description
 */
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * TODO write description
 */
export const SUPABASE =
    SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            // No sign-in yet, so there is no session to store or refresh.
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        })
        : null;
