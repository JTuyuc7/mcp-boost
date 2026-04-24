import { createRequire } from "node:module";

export interface StaticImportMatch {
    bindings: string;
    specifier: string;
}

interface NativeImportsModule {
    extractStaticImports?: (source: string) => StaticImportMatch[];
}

let cachedNativeExtractor: ((source: string) => StaticImportMatch[]) | null | undefined;

function getNativeExtractor(): ((source: string) => StaticImportMatch[]) | null {
    if (cachedNativeExtractor !== undefined) return cachedNativeExtractor;

    try {
        const require = createRequire(import.meta.url);
        const mod = require("@mcp-boost/tests-native") as NativeImportsModule;

        if (typeof mod.extractStaticImports === "function") {
            cachedNativeExtractor = mod.extractStaticImports;
            return cachedNativeExtractor;
        }
    } catch {
        // Optional dependency: keep pure TS path when native module is unavailable.
    }

    cachedNativeExtractor = null;
    return null;
}

/**
 * Uses native extraction when available, otherwise falls back to regex parsing.
 */
export function extractStaticImports(source: string, importRegex: RegExp): StaticImportMatch[] {
    const nativeExtractor = getNativeExtractor();
    if (nativeExtractor) {
        try {
            const matches = nativeExtractor(source);
            if (Array.isArray(matches)) {
                return matches.filter(
                    (m): m is StaticImportMatch =>
                        !!m && typeof m.bindings === "string" && typeof m.specifier === "string"
                );
            }
        } catch {
            // If native parsing fails unexpectedly, continue with stable TS fallback.
        }
    }

    const fallbackMatches: StaticImportMatch[] = [];
    importRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
        fallbackMatches.push({
            bindings: match[1] ?? "",
            specifier: match[2] ?? "",
        });
    }

    return fallbackMatches;
}

