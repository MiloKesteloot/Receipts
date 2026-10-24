import type { SupportedStorage } from "@supabase/supabase-js";

/**
 * Web (and Node, for unit tests) leave this undefined so Supabase falls back to
 * the browser's own `localStorage`, or memory when there is none. iOS and
 * Android use `session-storage.native.ts` instead.
 */
export const SESSION_STORAGE: SupportedStorage | undefined = undefined;
