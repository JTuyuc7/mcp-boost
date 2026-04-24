import { createRequire } from "node:module";

export interface NativeExtractedDeclaration {
    kind: string;
    name: string;
    lines: string[];
}

export interface NativeTestContextScan {
    relativeImports: string[];
    ownExports: NativeExtractedDeclaration[];
}

interface RawNativeTestContextScan {
    relativeImports?: unknown;
    relative_imports?: unknown;
    ownExports?: unknown;
    own_exports?: unknown;
}

interface NativeContextModule {
    scanTestContextSource?: (source: string) => RawNativeTestContextScan;
}

let cachedNativeScanner: ((source: string) => RawNativeTestContextScan) | null | undefined;

function getNativeScanner(): ((source: string) => RawNativeTestContextScan) | null {
    if (cachedNativeScanner !== undefined) return cachedNativeScanner;

    if (process.env.MCP_TESTS_DISABLE_NATIVE_CONTEXT === "1") {
        cachedNativeScanner = null;
        return null;
    }

    try {
        const require = createRequire(import.meta.url);
        const mod = require("@mcp/tests-native") as NativeContextModule;

        if (typeof mod.scanTestContextSource === "function") {
            cachedNativeScanner = mod.scanTestContextSource;
            return cachedNativeScanner;
        }
    } catch {
        // Optional dependency: keep TypeScript fallback when native module is unavailable.
    }

    cachedNativeScanner = null;
    return null;
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

function normalizeDeclarations(value: unknown): NativeExtractedDeclaration[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const entry = item as { kind?: unknown; name?: unknown; lines?: unknown };
            if (typeof entry.kind !== "string" || typeof entry.name !== "string") return null;
            return {
                kind: entry.kind,
                name: entry.name,
                lines: normalizeStringArray(entry.lines),
            };
        })
        .filter((item): item is NativeExtractedDeclaration => item !== null);
}

/**
 * Uses native source scanning when available. Returns null so caller can
 * continue with stable TS parsing when native code is unavailable/fails.
 */
export function scanTestContextSource(source: string): NativeTestContextScan | null {
    const nativeScanner = getNativeScanner();
    if (!nativeScanner) return null;

    try {
        const raw = nativeScanner(source);
        return {
            relativeImports: normalizeStringArray(raw.relativeImports ?? raw.relative_imports),
            ownExports: normalizeDeclarations(raw.ownExports ?? raw.own_exports),
        };
    } catch {
        return null;
    }
}

