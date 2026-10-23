/// <reference types="node" />
/**
 * Lets Node's built-in test runner import our app code the same way the app
 * does. The app (Metro bundler) understands two shortcuts Node doesn't:
 *   1. `@/lib/x` means `src/lib/x` (from tsconfig.json "paths")
 *   2. imports can leave off the `.ts` / `.tsx` extension
 * This file adds both, only while running tests. The app never loads it.
 *
 * Needs Node 22.15 or newer (for `module.registerHooks`).
 *
 * PLACEHOLDER: if the team adds a real test framework later (e.g. jest-expo),
 * it handles this itself and this file can be deleted.
 */

import { registerHooks, type ResolveHookSync } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * Absolute URL of the project's `src/` folder.
 */
const SRC_URL = pathToFileURL(`${process.cwd()}/src/`).href;

/**
 * Extensions to try when an import leaves the extension off.
 */
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/**
 * Resolves `@/` imports and extensionless imports, then defers to Node.
 * @param specifier What the code imported, e.g. "@/lib/supabase"
 * @param context Node's resolve context
 * @param nextResolve Node's default resolver
 * @returns The resolved module
 */
const resolve: ResolveHookSync = (specifier, context, nextResolve) => {
  const mapped = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), SRC_URL).href
    : specifier;

  try {
    return nextResolve(mapped, context);
  } catch (error) {
    const isLocal = mapped.startsWith(".") || mapped.startsWith("file:");
    const notFound =
      (error as { code?: string }).code === "ERR_MODULE_NOT_FOUND";
    if (!isLocal || !notFound) throw error;

    for (const extension of EXTENSIONS) {
      try {
        return nextResolve(mapped + extension, context);
      } catch {
        // try the next extension
      }
    }
    throw error;
  }
};

registerHooks({ resolve });
