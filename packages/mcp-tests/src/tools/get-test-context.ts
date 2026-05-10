/**
 * Tool: get_test_context
 *
 * Lee las dependencias de primer nivel de cada archivo fuente y extrae solo
 * los tipos, interfaces, enums y constantes exportadas — el contexto mínimo
 * que el modelo necesita para generar mocks e imports correctos.
 *
 * NO lee implementaciones completas, solo firmas y tipos.
 */

import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveRootPath, rootPathErrorResponse } from "../helpers/repo.js";
import { scanTestContextSource as scanNativeTestContextSource } from "../helpers/native-test-context.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const GetTestContextSchema = {
    rootPath: z
        .string()
        .describe(
            "Absolute path to the repository root. Must be provided explicitly — " +
            "never infer it from cwd."
        ),
    files: z
        .array(z.string())
        .min(1)
        .describe(
            "List of absolute or rootPath-relative paths to the source files " +
            "you are about to test. The tool will read their first-level relative " +
            "imports and extract exported types/interfaces/enums/constants."
        ),
    maxDepth: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .default(1)
        .describe(
            "How many levels of relative imports to follow (default: 1). " +
            "Increase to 2-3 only if the type dependencies are deep."
        ),
};


// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Patterns que identifican declaraciones exportadas de tipos / firmas.
 * Captura solo líneas declarativas, no implementaciones.
 */
const EXPORT_PATTERNS: RegExp[] = [
    /^export\s+(type\s+)?interface\s+\w+/,
    /^export\s+(type\s+)?type\s+\w+/,
    /^export\s+(declare\s+)?enum\s+\w+/,
    /^export\s+const\s+\w+\s*[:=]/,
    /^export\s+function\s+\w+\s*[<(]/,
    /^export\s+(abstract\s+)?class\s+\w+/,
    /^export\s+default\s+/,
];

/** Regex para detectar imports relativos */
const RELATIVE_IMPORT_RE =
    /^\s*import\s+(?:type\s+)?(?:[^'"]*\s+from\s+)?['"](\.[^'"]+)['"]/gm;

/** Extensiones a intentar cuando un import no tiene extensión */
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

/**
 * Resuelve un import relativo a una ruta absoluta en disco.
 * Retorna null si no se puede encontrar el archivo.
 */
function resolveRelativeImport(
    importPath: string,
    fromFile: string,
    root: string
): string | null {
    const dir = path.dirname(fromFile);
    const base = path.resolve(dir, importPath);

    // Si ya tiene extensión reconocida, prueba directo
    const knownExts = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];
    if (knownExts.includes(path.extname(base))) {
        if (fs.existsSync(base)) {
            return base.startsWith(root) ? base : null;
        }

        // TS projects often import compiled .js paths from source; try TS siblings.
        const ext = path.extname(base);
        if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
            const stem = base.slice(0, -ext.length);
            const jsToTsCandidates = [
                `${stem}.ts`,
                `${stem}.tsx`,
                `${stem}.mts`,
                `${stem}.cts`,
                path.join(stem, "index.ts"),
                path.join(stem, "index.tsx"),
            ];
            for (const candidate of jsToTsCandidates) {
                if (fs.existsSync(candidate) && candidate.startsWith(root)) {
                    return candidate;
                }
            }
        }

        return null;
    }

    for (const ext of RESOLVE_EXTS) {
        const candidate = base + ext;
        if (fs.existsSync(candidate)) {
            // Asegurarse de que está dentro del repo
            if (candidate.startsWith(root)) return candidate;
        }
    }
    return null;
}

interface ExtractedDeclaration {
    kind: "interface" | "type" | "enum" | "const" | "function" | "class" | "default" | "other";
    name: string;
    lines: string[];
}

interface TypeImportSuggestion {
    name: string;
    fromFile: string;
    modulePath: string;
    confidence: "high" | "medium";
    reason: string;
}

const TYPE_NAME_HINT_RE =
    /(Props|Input|Params|Payload|DTO|Request|Response|Schema|State|Config|Options|Result|Model|Entity)$/;

function toPosixPath(p: string): string {
    return p.replace(/\\/g, "/");
}

function toModulePath(file: string): string {
    const posix = toPosixPath(file);
    const withoutExt = posix.replace(/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, "");
    return withoutExt.replace(/\/index$/, "");
}

function shouldSuggestAsType(decl: ExtractedDeclaration): boolean {
    if (!decl.name || decl.name === "(anonymous)") return false;
    if (decl.kind === "interface" || decl.kind === "type" || decl.kind === "enum") return true;
    if (decl.kind === "class") return /^[A-Z]/.test(decl.name);
    return false;
}

function inferConfidence(decl: ExtractedDeclaration): "high" | "medium" {
    if (TYPE_NAME_HINT_RE.test(decl.name)) return "high";
    if (decl.kind === "interface" || decl.kind === "type") return "high";
    return "medium";
}

function collectTypeImportSuggestions(
    relativePath: string,
    ownExports: ExtractedDeclaration[],
    dependencyExports: Record<string, ExtractedDeclaration[]>
): TypeImportSuggestion[] {
    const suggestions: TypeImportSuggestion[] = [];
    const seen = new Set<string>();

    const pushIfNew = (decl: ExtractedDeclaration, fromFile: string, reason: string) => {
        if (!shouldSuggestAsType(decl)) return;
        const key = `${decl.name}::${fromFile}`;
        if (seen.has(key)) return;
        seen.add(key);

        suggestions.push({
            name: decl.name,
            fromFile,
            modulePath: toModulePath(fromFile),
            confidence: inferConfidence(decl),
            reason,
        });
    };

    for (const decl of ownExports) {
        pushIfNew(decl, relativePath, "Exported by the source file under test.");
    }

    for (const [depFile, decls] of Object.entries(dependencyExports)) {
        for (const decl of decls) {
            pushIfNew(decl, depFile, "Exported by a relative dependency used by the source file.");
        }
    }

    suggestions.sort((a, b) => {
        if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
        if (a.fromFile !== b.fromFile) return a.fromFile.localeCompare(b.fromFile);
        return a.name.localeCompare(b.name);
    });

    return suggestions;
}

function normalizeDeclarationKind(kind: string): ExtractedDeclaration["kind"] {
    if (kind === "interface") return "interface";
    if (kind === "type") return "type";
    if (kind === "enum") return "enum";
    if (kind === "const") return "const";
    if (kind === "function") return "function";
    if (kind === "class") return "class";
    if (kind === "default") return "default";
    return "other";
}

function scanSource(content: string): {
    relativeImports: string[];
    ownExports: ExtractedDeclaration[];
} {
    const native = scanNativeTestContextSource(content);
    if (native) {
        return {
            relativeImports: native.relativeImports,
            ownExports: native.ownExports.map((decl) => ({
                kind: normalizeDeclarationKind(decl.kind),
                name: decl.name,
                lines: decl.lines,
            })),
        };
    }

    const relativeImports: string[] = [];
    RELATIVE_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RELATIVE_IMPORT_RE.exec(content)) !== null) {
        if (match[1]) relativeImports.push(match[1]);
    }

    return {
        relativeImports,
        ownExports: extractExportedDeclarations(content),
    };
}

interface AnalyzerCaches {
    fileContent: Map<string, Promise<string | null>>;
    sourceScan: Map<string, ReturnType<typeof scanSource>>;
}

async function readFileCached(
    filePath: string,
    caches: AnalyzerCaches
): Promise<string | null> {
    const cached = caches.fileContent.get(filePath);
    if (cached) return cached;

    const pending = fsPromises.readFile(filePath, "utf-8").catch(() => null);
    caches.fileContent.set(filePath, pending);
    return pending;
}

async function getFileScan(
    filePath: string,
    caches: AnalyzerCaches
): Promise<ReturnType<typeof scanSource> | null> {
    const cached = caches.sourceScan.get(filePath);
    if (cached) return cached;

    const content = await readFileCached(filePath, caches);
    if (content === null) return null;

    const scanned = scanSource(content);
    caches.sourceScan.set(filePath, scanned);
    return scanned;
}

/**
 * Extrae bloques de declaraciones exportadas de un archivo TypeScript/JavaScript.
 * Estrategia: detecta la línea de inicio de cada declaración y recoge hasta
 * que el contador de llaves llegue a 0 (o la línea siguiente sea otra declaración).
 */
function extractExportedDeclarations(content: string): ExtractedDeclaration[] {
    const rawLines = content.split("\n");
    const declarations: ExtractedDeclaration[] = [];

    let i = 0;
    while (i < rawLines.length) {
        const line = rawLines[i]!;

        const isExport = EXPORT_PATTERNS.some((p) => p.test(line.trim()));
        if (!isExport) {
            i++;
            continue;
        }

        // Determinar kind y name
        const kind = detectKind(line);
        const name = detectName(line);

        // Recoger el bloque hasta que las llaves se cierren
        const block: string[] = [];
        let depth = 0;
        let j = i;

        while (j < rawLines.length) {
            const l = rawLines[j]!;
            block.push(l);

            // Para líneas de tipo simple (sin llaves ni paréntesis abiertos) terminamos en la primera línea
            const opens = (l.match(/[{(]/g) ?? []).length;
            const closes = (l.match(/[})]/g) ?? []).length;
            depth += opens - closes;

            // Si nunca se abrió nada, terminar al primer punto y coma o final de línea
            if (depth <= 0 && j > i) break;
            if (depth === 0 && j === i && !l.includes("{") && !l.includes("(")) break;

            j++;
        }

        // Limitar a 40 líneas por declaración para no saturar el contexto
        declarations.push({
            kind,
            name,
            lines: block.slice(0, 40),
        });

        i = j + 1;
    }

    return declarations;
}

function detectKind(line: string): ExtractedDeclaration["kind"] {
    const t = line.trim();
    if (t.includes("interface")) return "interface";
    if (t.includes("enum")) return "enum";
    if (/\bconst\b/.test(t)) return "const";
    if (/\bfunction\b/.test(t)) return "function";
    if (/\bclass\b/.test(t)) return "class";
    if (t.startsWith("export type")) return "type";
    if (t.startsWith("export default")) return "default";
    return "other";
}

function detectName(line: string): string {
    const m = line.match(
        /\b(?:interface|type|enum|const|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
    );
    return m?.[1] ?? "(anonymous)";
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

interface FileContext {
    file: string;
    relativePath: string;
    /** Imports relativos de primer (o N-ésimo) nivel encontrados */
    firstLevelImports: string[];
    /** Declaraciones exportadas del propio archivo */
    ownExports: ExtractedDeclaration[];
    /** Declaraciones exportadas de los imports analizados */
    dependencyExports: Record<string, ExtractedDeclaration[]>;
    requiredTypeImports: TypeImportSuggestion[];
    /** Advertencias (archivo no encontrado, etc.) */
    warnings: string[];
}

async function analyzeFileContext(
    sourceFile: string,
    root: string,
    maxDepth: number,
    caches: AnalyzerCaches
): Promise<FileContext> {
    const warnings: string[] = [];
    const resolved = path.isAbsolute(sourceFile)
        ? sourceFile
        : path.resolve(root, sourceFile);

    const sourceScan = await getFileScan(resolved, caches);
    if (!sourceScan) {
        return {
            file: resolved,
            relativePath: path.relative(root, resolved),
            firstLevelImports: [],
            ownExports: [],
            dependencyExports: {},
            requiredTypeImports: [],
            warnings: [`File not found: ${resolved}`],
        };
    }

    // Extraer declaraciones del propio archivo
    const ownExports = sourceScan.ownExports;

    // Encontrar imports relativos (primer nivel)
    const firstLevelImports: string[] = [];
    const dependencyExports: Record<string, ExtractedDeclaration[]> = {};

    // BFS hasta maxDepth
    const toVisit: Array<{ file: string; depth: number; scan?: ReturnType<typeof scanSource> }> = [
        { file: resolved, depth: 0, scan: sourceScan },
    ];
    let queueIndex = 0;
    const visited = new Set<string>([resolved]);

    while (queueIndex < toVisit.length) {
        const current = toVisit[queueIndex++]!;
        if (current.depth >= maxDepth) continue;

        const currentScan = current.scan ?? (await getFileScan(current.file, caches));
        if (!currentScan) continue;

        for (const importStr of currentScan.relativeImports) {
            if (!importStr) continue;

            const depResolved = resolveRelativeImport(importStr, current.file, root);
            if (!depResolved) {
                if (current.depth === 0) {
                    warnings.push(`Could not resolve import '${importStr}' in ${path.relative(root, current.file)}`);
                }
                continue;
            }

            const relDep = path.relative(root, depResolved);

            if (current.depth === 0) {
                firstLevelImports.push(relDep);
            }

            if (!visited.has(depResolved)) {
                visited.add(depResolved);

                const depScan = await getFileScan(depResolved, caches);
                if (!depScan) {
                    warnings.push(`Could not read dependency: ${relDep}`);
                    continue;
                }

                const depExports = depScan.ownExports;
                if (depExports.length > 0) {
                    dependencyExports[relDep] = depExports;
                }

                if (current.depth + 1 < maxDepth) {
                    toVisit.push({ file: depResolved, depth: current.depth + 1, scan: depScan });
                }
            }
        }
    }

    const requiredTypeImports = collectTypeImportSuggestions(
        path.relative(root, resolved),
        ownExports,
        dependencyExports
    );

    return {
        file: resolved,
        relativePath: path.relative(root, resolved),
        firstLevelImports,
        ownExports,
        dependencyExports,
        requiredTypeImports,
        warnings,
    };
}

// ---------------------------------------------------------------------------
// Output formatter
// ---------------------------------------------------------------------------

function formatFileContext(ctx: FileContext): string {
    const parts: string[] = [];
    parts.push(`=== ${ctx.relativePath} ===`);

    if (ctx.warnings.length > 0) {
        parts.push(`⚠ Warnings:\n${ctx.warnings.map((w) => `  - ${w}`).join("\n")}`);
    }

    if (ctx.ownExports.length > 0) {
        parts.push(`\n--- Own exports (${ctx.ownExports.length}) ---`);
        for (const decl of ctx.ownExports) {
            parts.push(decl.lines.join("\n"));
        }
    } else {
        parts.push("\n(no exported declarations found)");
    }

    const depKeys = Object.keys(ctx.dependencyExports);
    if (depKeys.length > 0) {
        parts.push(`\n--- Dependency exports ---`);
        for (const dep of depKeys) {
            const decls = ctx.dependencyExports[dep]!;
            parts.push(`\n# ${dep} (${decls.length} exports)`);
            for (const decl of decls) {
                parts.push(decl.lines.join("\n"));
            }
        }
    }

    if (ctx.requiredTypeImports.length > 0) {
        parts.push("\n--- Required type imports (suggested) ---");
        for (const t of ctx.requiredTypeImports.slice(0, 30)) {
            parts.push(
                `- ${t.name} from ${t.fromFile} [${t.confidence}]`
            );
        }
        if (ctx.requiredTypeImports.length > 30) {
            parts.push(`- ... and ${ctx.requiredTypeImports.length - 30} more`);
        }
    }

    return parts.join("\n");
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) return [];

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function runWorker() {
        while (true) {
            const currentIndex = nextIndex++;
            if (currentIndex >= items.length) return;
            results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
        }
    }

    await Promise.all(Array.from({ length: safeConcurrency }, () => runWorker()));
    return results;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerGetTestContext(server: McpServer): void {
    server.registerTool(
        "get_test_context",
        {
            description:
                "Reads the first-level relative imports of the given source files and " +
                "extracts only the exported types, interfaces, enums, constants and " +
                "function signatures — the minimum context needed to generate correct " +
                "mocks and imports in a test file. Does NOT return full implementations. " +
                "Use this BEFORE generating test content when the source file has complex " +
                "type dependencies.",
            inputSchema: GetTestContextSchema,
        },
        async (args) => {
            const rootResult = resolveRootPath(args.rootPath);
            if (!rootResult.ok) return rootPathErrorResponse(rootResult);
            const root = rootResult.root;

            const caches: AnalyzerCaches = {
                fileContent: new Map<string, Promise<string | null>>(),
                sourceScan: new Map<string, ReturnType<typeof scanSource>>(),
            };

            const fileContexts = await mapWithConcurrency(args.files, 4, (file) =>
                analyzeFileContext(file, root, args.maxDepth, caches)
            );

            // Structured JSON output
            const structured = fileContexts.map((ctx) => ({
                file: ctx.relativePath,
                warnings: ctx.warnings,
                ownExports: ctx.ownExports.map((d) => ({
                    kind: d.kind,
                    name: d.name,
                    snippet: d.lines.join("\n"),
                })),
                firstLevelImports: ctx.firstLevelImports,
                requiredTypeImports: ctx.requiredTypeImports,
                dependencyExports: Object.fromEntries(
                    Object.entries(ctx.dependencyExports).map(([dep, decls]) => [
                        dep,
                        decls.map((d) => ({
                            kind: d.kind,
                            name: d.name,
                            snippet: d.lines.join("\n"),
                        })),
                    ])
                ),
            }));

            // Human-readable text for quick scanning
            const text = fileContexts.map(formatFileContext).join("\n\n");

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                root,
                                files: structured,
                                summary:
                                    `Analyzed ${fileContexts.length} file(s). ` +
                                    `Total own exports: ${structured.reduce((n, f) => n + f.ownExports.length, 0)}. ` +
                                    `Total dependency exports: ${structured.reduce((n, f) => n + Object.values(f.dependencyExports).flat().length, 0)}.`,
                                humanReadable: text,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        }
    );
}
