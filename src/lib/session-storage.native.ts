import "expo-sqlite/localStorage/install";
import type { SupportedStorage } from "@supabase/supabase-js";

/**
 * Where Supabase keeps the signed-in session on iOS and Android, so users stay
 * signed in between launches. The import above provides `localStorage` backed
 * by SQLite.
 */
export const SESSION_STORAGE: SupportedStorage | undefined = globalThis.localStorage;
